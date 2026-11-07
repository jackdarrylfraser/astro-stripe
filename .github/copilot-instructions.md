# Project Guidelines

## Architecture

- This is an Astro server-rendered site deployed with the Vercel adapter.
- Keep page markup in `.astro` files. Do not construct or embed HTML in strings; use Astro templates for rendered pages.
- Keep protected member content in `src/content/members/`, never in `public/`. Preserve the middleware access guard and Stripe as the source of truth for subscription status.
- Keep secrets server-side; never expose them through `PUBLIC_` variables.

## Validation

- Run `bun run check` and `bun run build` after code changes.
- Follow the setup and deployment guidance in [README.md](../README.md).
