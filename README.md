# Astro Stripe

An Astro SSR site with Stripe subscription-gated Markdown pages. Subscribers sign in with email magic links; no application user accounts are stored.

## Requirements

- Bun 1.2+
- A Vercel project with Vercel KV configured
- Stripe product/recurring price, subscription Payment Link, and webhook
- Resend account and a verified sending domain

## Local setup

1. Install dependencies with `bun install`.
2. Copy `.env.example` to `.env` and fill in the values.
3. Configure the Stripe Payment Link success URL to `{SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`.
4. Configure the Stripe webhook URL as `{SITE_URL}/api/stripe/webhook` and subscribe to `customer.updated`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
5. Run `bun run dev`.

The app requires the Payment Link ID and URL, Stripe API and webhook secrets, Vercel KV REST credentials, a Resend API key and sender, and a canonical `SITE_URL`. See `.env.example` for exact names. Do not expose server secrets through `PUBLIC_` variables.

## Deploy

Import the repository into Vercel and use the Bun install command (`bun install`) if it is not detected automatically. Configure the environment variables separately for Preview (Stripe test mode) and Production (Stripe live mode). The Astro Vercel adapter deploys SSR pages and API routes on the Node.js runtime.

Member Markdown belongs in `src/content/members/`; never put protected content in `public/`. Middleware guards the server-rendered `/members/*` route. Stripe remains the source of truth when the KV subscription cache is missing or stale.

Run `bun run check` and `bun run build` before deployment.
