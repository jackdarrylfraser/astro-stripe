import { getSecret } from 'astro:env/server';
import { getBaseUrl } from './base-url';

export function getSiteUrl(): string {
  const vercelEnv = getSecret('VERCEL_ENV');
  return getBaseUrl({
    VERCEL_ENV: vercelEnv,
    VERCEL_BRANCH_URL: getSecret('VERCEL_BRANCH_URL'),
    VERCEL_URL: getSecret('VERCEL_URL'),
    VERCEL_PROJECT_PRODUCTION_URL: getSecret('VERCEL_PROJECT_PRODUCTION_URL'),
    PROD: import.meta.env.PROD,
  });
}
