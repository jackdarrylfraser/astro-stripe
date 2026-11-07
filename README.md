# Astro Stripe

An Astro SSR site with Stripe subscription-gated Markdown pages. Subscribers sign in with email magic links; no application user accounts are stored.

## Requirements

- Bun 1.2+
- An Upstash Redis database with REST credentials
- Stripe product/recurring price, subscription Payment Link, and webhook
- Resend account and a verified sending domain

## Local setup

1. Install dependencies with `bun install`.
2. Copy `.env.example` to `.env` and fill in the values.
3. Configure the Stripe Payment Link success URL to `{origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`.
4. Configure the Stripe webhook URL as `{origin}/api/stripe/webhook` and subscribe to `customer.updated`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
5. Run `bun run dev`.

The app requires the Payment Link ID and URL, Stripe API and webhook secrets, Upstash Redis REST credentials, and a Resend API key and sender. See `.env.example` for exact names. Do not expose server secrets through `PUBLIC_` variables.

The server chooses the origin for magic links and Stripe portal returns as follows:

- On Vercel Production, `SITE_URL` takes precedence and must be an HTTPS origin for the intended custom domain. If unset, the app uses `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel chooses and may not be your preferred domain.
- On Vercel Preview, it uses `VERCEL_BRANCH_URL`, or `VERCEL_URL` if no branch URL is available, regardless of `SITE_URL`. These are hostnames supplied by Vercel, not URLs with a scheme.
- Locally, `SITE_URL` overrides the default `http://localhost:4321`. For non-Vercel production deployments, set `SITE_URL` explicitly.

Enable **Automatically expose System Environment Variables** in Vercel project settings. URL generation fails rather than producing a localhost or malformed link when the necessary deployment origin is unavailable. These values are used only on the server; the browser uses relative URLs, so no `PUBLIC_` base URL is needed.

Magic links and portal returns go to the selected origin, not necessarily the host where the user started. Login cookies are host-specific: a user signed in on a branch alias will not automatically be signed in on a deployment URL or custom domain. Branch aliases also move to the latest deployment. Use the same intended host throughout a flow, and account for Vercel Deployment Protection when opening emailed links.

Stripe's Payment Link success URL and webhook endpoint are configured in Stripe and do not change automatically with a Vercel deployment. Point each environment's Payment Link and webhook to its intended reachable origin, using test-mode resources for previews. A single Payment Link cannot automatically return to every preview branch; use a separate test Payment Link for the preview being tested. Local webhook testing requires a publicly reachable endpoint or Stripe CLI forwarding.

For Redis, use Upstash's `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The app needs the read/write token, not `KV_REST_API_READ_ONLY_TOKEN`; `REDIS_URL` and `KV_URL` are not REST URLs. Existing deployments may continue using `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as fallbacks. If both names are set, the `KV_` values take precedence.

## Deploy

Import the repository into Vercel and use the Bun install command (`bun install`) if it is not detected automatically. Configure the environment variables separately for Preview (Stripe test mode) and Production (Stripe live mode). The Astro Vercel adapter deploys SSR pages and API routes on the Node.js runtime.

Member Markdown belongs in `src/content/members/`; never put protected content in `public/`. Middleware guards the server-rendered `/members/*` route. Stripe remains the source of truth when the Redis subscription cache is missing or stale.

Run `bun test`, `bun run check`, and `bun run build` before deployment.
