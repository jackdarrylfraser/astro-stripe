# Project Guidelines

## Architecture

- This is an Astro server-rendered site deployed with the Vercel adapter.
- Keep page markup in `.astro` files. Do not construct or embed HTML in strings; use Astro templates for rendered pages.
- Keep protected member content in `src/content/members/`, never in `public/`. Preserve the middleware access guard and Stripe as the source of truth for subscription status.
- Keep secrets server-side; never expose them through `PUBLIC_` variables.

## Validation

- Run `bun run check`, `bun run build` and `bun run test` after code changes.
- Follow the setup and deployment guidance in [README.md](../README.md).

## Documentation

- Keep `/docs` folder up-to-date with code changes.
- Use JSDoc comments for functions and modules where appropriate.
- Ensure README.md reflects the current setup and deployment instructions.
