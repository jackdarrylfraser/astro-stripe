# Technical overview

This document describes the implementation of the subscription-gated Astro site, following the higher-level decisions in [`plan.md`](./plan.md). The code is organized as an Astro SSR application using the Vercel adapter, Stripe, Vercel KV, and Resend.

## Application structure

```text
astro-stripe/
├── .env.example
├── .gitignore
├── astro.config.mjs
├── package.json
├── bun.lock
├── README.md
├── plans/
│   ├── plan.md
│   └── technical-overview.md
├── src/
│   ├── content.config.ts
│   ├── middleware.ts
│   ├── content/
│   │   └── members/
│   │       └── example.md
│   ├── layouts/
│   │   └── SiteLayout.astro
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── authorization.ts
│   │   ├── env.ts
│   │   ├── stripe.ts
│   │   ├── subscriptions.ts
│   │   └── tokens.ts
│   ├── types/
│   │   └── locals.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── pricing.astro
│   │   ├── sign-in.astro
│   │   ├── members/
│   │   │   ├── index.astro
│   │   │   └── [...slug].astro
│   │   ├── checkout/
│   │   │   └── success.astro
│   │   └── api/
│   │       ├── stripe/
│   │       │   ├── checkout-complete.ts
│   │       │   ├── portal.ts
│   │       │   └── webhook.ts
│   │       └── auth/
│   │           ├── magic-link.ts
│   │           ├── verify.ts
│   │           └── logout.ts
│   └── env.d.ts
└── tsconfig.json
```

`astro.config.mjs` enables Astro server rendering and the Vercel adapter. Dynamic pages and API routes run as serverless functions. The Vercel adapter uses the Node.js runtime; application code avoids Bun-only APIs.

| Area | Responsibility |
|---|---|
| `src/content.config.ts` | Define the Markdown content collection, schema, and loader for member pages. |
| `src/lib/auth.ts` | Resolve the email identity from a valid KV-backed login session and create/revoke those sessions. |
| `src/lib/stripe.ts` | Initialize and export the Stripe SDK client in server-only code. |
| `src/lib/subscriptions.ts` | Read, refresh, and update subscription records in Vercel KV by normalized email; normalize Stripe events into the app's record shape. |
| `src/lib/authorization.ts`, `src/middleware.ts` | Apply the subscription policy to protected page requests and send unauthenticated or inactive users to the appropriate page. |
| `src/pages/checkout/success.astro`, `src/pages/api/stripe/checkout-complete.ts` | Verify a completed Payment Link Checkout Session, write the subscription record to KV by email, and establish the first KV-backed login session for that email; no account is created. |
| `src/pages/api/auth/magic-link.ts`, `src/pages/api/auth/verify.ts` | Send and redeem one-time email magic links without creating user/account records; create KV-backed login sessions after successful verification. |
| `src/pages/api/auth/logout.ts` | Delete the current KV login-session record and clear its browser cookie without deleting subscription state. |
| `src/pages/api/stripe/webhook.ts` | Verify Stripe webhook signatures and synchronize subscription state, including deleting only the matching record after cancellation takes effect. |
| `src/content/members/`, `src/pages/members/[...slug].astro` | Keep member Markdown as source content and render it through a server-protected Astro route. |
| `src/pages/`, `src/layouts/` | Public landing/pricing pages, magic-link sign-in UI, shared layout, a direct Stripe Payment Link, and buttons that call app API routes where needed. |
| `src/env.d.ts` | Type the required server-side environment variables and Astro client types. |
| `src/types/locals.ts` | Augment Astro locals for the email identity resolved from the login-session cookie. |
| `.env.example` | Document required environment variable names without storing real credentials. |

## Core types and server clients

The KV subscription record is a cache/projection of Stripe state, refreshed by verified Stripe webhooks and direct Stripe checks when the cache is missing or stale. A browser redirect alone is never proof of purchase; the Checkout completion endpoint retrieves and validates the session from Stripe.

```ts
// src/lib/subscriptions.ts
import type Stripe from 'stripe';

export interface SubscriptionRecord {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: Stripe.Subscription.Status;
  currentPeriodEnd: number;
  checkedAt: number;
}

export function getSubscriptionByEmail(
  email: string,
): Promise<SubscriptionRecord | null>;

export function getFreshSubscriptionByEmail(
  email: string,
): Promise<SubscriptionRecord | null>;

export function saveSubscription(
  record: SubscriptionRecord,
): Promise<void>;

export function mapStripeSubscription(
  subscription: Stripe.Subscription,
  email: string,
): SubscriptionRecord;
```

```ts
// src/lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});
```

Normalize authenticated and Stripe-provided email addresses consistently (trim whitespace and lowercase; do not apply provider-specific alias rules). Use that normalized email as the KV key, for example `subscription:${normalizedEmail}`:

```ts
import { kv } from '@vercel/kv';

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
const subscriptionKey = (email: string): string =>
  `subscription:${normalizeEmail(email)}`;
const customerEmailKey = (customerId: string): string =>
  `stripe-customer-email:${customerId}`;
const checkoutCompletionKey = (sessionId: string): string =>
  `checkout-completion:${sessionId}`;
const loginSessionKey = (tokenHash: string): string =>
  `login-session:${tokenHash}`;
const magicLinkKey = (tokenHash: string): string =>
  `magic-link:${tokenHash}`;

export function getSubscriptionByEmail(
  email: string,
): Promise<SubscriptionRecord | null> {
  return kv.get<SubscriptionRecord>(subscriptionKey(email));
}

export async function saveSubscription(
  updatedRecord: SubscriptionRecord,
): Promise<void> {
  const email = normalizeEmail(updatedRecord.email);
  const previousEmail = await kv.get<string>(
    customerEmailKey(updatedRecord.stripeCustomerId),
  );
  if (previousEmail && previousEmail !== email) {
    await kv.del(subscriptionKey(previousEmail));
  }
  await kv.set(subscriptionKey(email), {
    ...updatedRecord,
    email,
    checkedAt: Date.now(),
  });
  await kv.set(customerEmailKey(updatedRecord.stripeCustomerId), email);
}
```

The normalized email is the identity and subscription key; there is no user/account table or app-user-to-Stripe-customer mapping. `checkedAt` controls how long a cached Stripe status may be trusted; use a short configurable freshness window and let webhooks refresh state sooner. `getFreshSubscriptionByEmail` returns a recent KV record or, if missing/stale, queries Stripe for the customer and its subscription using the normalized email, updates KV, and fails closed if Stripe cannot verify active access. Stripe API checks verify subscription entitlement, not login credentials; magic-link redemption verifies control of the email address. Stripe webhooks also update KV. The `stripe-customer-email` index lets webhook processing invalidate the previous email key if a customer changes their Stripe email.

Login sessions and magic-link tokens are separate from subscription records. Store only hashes of random, high-entropy tokens in KV, with short expirations for magic links and bounded expirations for login sessions. The browser receives the raw login token only in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie. On logout, delete the matching KV login-session record and clear the cookie; do not delete the subscription record. Use an atomic one-time claim for Checkout Session IDs and magic-link tokens so retries or replays cannot create duplicate sessions.

## Email login and subscription gate

```ts
// src/lib/auth.ts
export interface EmailIdentity {
  email: string;
}

export interface LoginSessionRecord {
  email: string;
  expiresAt: number;
}

export async function getCurrentIdentity(
  locals: App.Locals,
): Promise<EmailIdentity | null>;

export async function createLoginSession(
  email: string,
): Promise<{ cookieValue: string; record: LoginSessionRecord }>;

export async function revokeLoginSession(cookieValue: string): Promise<void>;
```

Use email delivery for magic links, but do not configure an auth adapter that persists users or accounts. The first successful purchase establishes a login session only after the server verifies its Checkout Session. Later, a customer requests a magic link; issue it only after confirming an active subscription from a fresh KV record or Stripe, return a generic response that does not reveal whether the email is subscribed, and atomically redeem its one-time token to create a login session. Middleware resolves the normalized email from the KV login session and checks subscription state:

```ts
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { getCurrentIdentity } from './lib/auth';
import {
  getFreshSubscriptionByEmail,
  normalizeEmail,
} from './lib/subscriptions';
import { hasActiveAccess } from './lib/authorization';

export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith('/members/')) {
    return next();
  }

  const identity = await getCurrentIdentity(context.locals);
  if (!identity) {
    return context.redirect('/sign-in');
  }

  const email = normalizeEmail(identity.email);
  const subscription = await getFreshSubscriptionByEmail(email);
  if (!hasActiveAccess(subscription)) {
    return context.redirect('/pricing');
  }

  return next();
});
```

The access policy should explicitly decide which Stripe statuses grant access; the plan names `active` and `trialing`. Keep that policy in one helper instead of repeating status checks in routes.

```ts
// src/lib/authorization.ts
import type { SubscriptionRecord } from './subscriptions';

export function hasActiveAccess(
  record: SubscriptionRecord | null,
): boolean {
  return record !== null
    && (record.status === 'active' || record.status === 'trialing')
    && record.currentPeriodEnd * 1000 > Date.now();
}
```

## Payment Link checkout and first login

1. Anyone can select the subscription on `/pricing`; sign-in is not required.
2. The pricing page links directly to the Stripe Payment Link. Configure the link in Stripe for the recurring Price and subscription mode; no app endpoint is needed to start checkout.
3. Stripe hosts Checkout, collects the customer's email, and creates the Stripe customer for the subscription.
4. Configure the Payment Link to redirect after successful payment to `/checkout/success?session_id={CHECKOUT_SESSION_ID}`. The success page sends the session ID to `POST /api/stripe/checkout-complete`; the ID is only a lookup key, never proof of purchase.
5. The completion route retrieves the session directly from Stripe and verifies it is complete, is for the expected subscription Payment Link, and has the required paid status. It derives the email and customer ID only from the verified Stripe session, normalizes the email, retrieves the current subscription state from Stripe, and upserts that record in KV.
6. Only after successful verification, establish a KV login session for that normalized email and set the session cookie. This is the email's first login; do not create an app account or user record. Make completion idempotent using an atomic Checkout Session ID claim so retries cannot mint extra login sessions. Never trust a request email or the Payment Link return URL as proof of purchase.
7. On later visits, validate the cookie against the KV login-session record. For a logged-out subscriber, send a one-time magic link to the email; on redemption, re-check active subscription state from fresh KV or Stripe before issuing a new session.
8. Logout deletes only the current KV login-session record and clears the browser cookie. Keep the email-keyed subscription record so the customer can log in again.

The pricing CTA links directly to the configured Stripe Payment Link URL:

```astro
<a href={import.meta.env.STRIPE_PAYMENT_LINK_URL}>Subscribe</a>
```

The Checkout session is the first-login proof only after its details are retrieved and validated server-side. Subsequent identity proof comes from redeeming a single-use magic link sent to the same email; its GET page requires an explicit confirmation POST so email link scanners do not consume the token. Subscription status is separate from login state and must be active or trialing according to the policy below. If email lookup finds duplicates, reconciliation consistently prefers active/trialing subscriptions, then the furthest period end, then the newest subscription (with ID as a stable final tie-breaker). If the customer changes their Stripe email, synchronize the record to the new email and invalidate the old email key.

## Stripe-hosted subscription management

The authenticated `/api/stripe/portal` route resolves the email from the KV-backed login session, resolves its current Stripe customer, creates a Stripe Billing Portal session, and redirects to Stripe's hosted Portal. It does not modify KV. The member page links to this route; there is no app-built subscription-management page.

## Webhook and KV synchronization

Configure a Stripe webhook endpoint for `customer.updated`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Verify the signature against the unparsed request body before acting. For subscription creation and update events, retrieve the Stripe customer server-side to obtain the current customer email, normalize it, and update the subscription record keyed by that email. When Stripe sends `customer.subscription.deleted`, remove that subscription from KV (only if the stored record still refers to that subscription). A cancellation scheduled for the end of the billing period is not a deletion: keep the record and update its status from `customer.subscription.updated` until Stripe reports the subscription deleted. On `customer.updated`, invalidate the old email key and reconcile the customer's current subscription records under the updated email:

```ts
// src/pages/api/stripe/webhook.ts (core operations)
const rawBody = await request.text();
const signature = request.headers.get('stripe-signature');
if (!signature) return new Response('Missing Stripe signature', { status: 400 });

const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  import.meta.env.STRIPE_WEBHOOK_SECRET,
);

switch (event.type) {
  case 'customer.updated': {
    const customer = event.data.object;
    await reconcileSubscriptionsForCustomer(customer);
    break;
  }
  case 'customer.subscription.created':
  case 'customer.subscription.updated': {
    const subscription = event.data.object;
    const customer = await stripe.customers.retrieve(subscription.customer);
    if (customer.deleted || !customer.email) {
      return new Response('Stripe customer has no usable email', {
        status: 500,
      });
    }
    await saveSubscription(
      mapStripeSubscription(subscription, normalizeEmail(customer.email)),
    );
    break;
  }
  case 'customer.subscription.deleted': {
    const subscription = event.data.object;
    const customer = await stripe.customers.retrieve(subscription.customer);
    if (customer.deleted || !customer.email) {
      return new Response('Stripe customer has no usable email', {
        status: 500,
      });
    }
    await deleteSubscriptionIfMatches(
      normalizeEmail(customer.email),
      subscription.id,
    );
    break;
  }
}

return new Response('ok', { status: 200 });
```

The full route should return an error response for invalid signatures or failed synchronization so Stripe can report/retry failures. Webhook processing should be idempotent because Stripe may deliver an event more than once. Never use a browser-provided email to synchronize entitlement; only use the email retrieved from the Stripe customer after verifying the webhook signature. Handle customer-email changes by invalidating the previous email key for that Stripe customer before writing the new record.

## Member Markdown and deployment boundary

Member Markdown should live under `src/content/members/` and be rendered only through the dynamic `/members/[...slug]` Astro route after middleware authorizes the request. Do not copy protected content into `public/` or generate publicly accessible static HTML for it. A static file can be fetched directly from its origin or CDN without passing through Astro middleware; the Vercel SSR route is the access-control boundary.

Set `output: 'server'` and the Vercel adapter in Astro configuration so protected pages and API routes execute server-side. Configure environment variables independently for local development, Preview (Stripe test mode), and Production (Stripe live mode). Typical server-only variables include:

```text
RESEND_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

Never expose secret values to client-side code or commit them. Verify exact environment variable names against the selected email-delivery and KV packages during implementation.

## Suggested implementation order

1. Add Astro SSR, the Vercel adapter, and environment-variable validation.
2. Implement magic-link email delivery, KV-backed login sessions, session revocation, and confirm that server routes resolve an email without persisting user/account records.
3. Add the Stripe client and email-keyed subscription records in KV.
4. Configure the Stripe Payment Link and its success redirect; implement the endpoint that creates a Stripe Customer Portal session and redirects to it without changing KV.
5. Implement signature-verified, idempotent webhook synchronization, including removing the matching KV subscription only after Stripe reports it deleted.
6. Add the middleware access policy and server-rendered member Markdown route.
7. Test first login from verified Checkout, magic-link login, token/session expiry, logout revocation, KV cache hits and Stripe fallback, inactive/active/trialing/canceled subscriptions, and webhook retries in Stripe test mode.
