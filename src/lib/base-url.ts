interface BaseUrlEnvironment {
  VERCEL_ENV?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  PROD?: boolean;
}

function origin(value: string, name: string): string {
  if (!URL.canParse(value)) {
    throw new Error(`Invalid ${name}: expected an absolute URL`);
  }
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error(`Invalid ${name}: expected an HTTPS origin`);
  }
  return url.origin;
}

function vercelOrigin(host: string, name: string): string {
  if (host.includes('/') || host.includes('?') || host.includes('#') || host.includes('@')) {
    throw new Error(`Invalid ${name}: expected a hostname without a protocol`);
  }
  return origin(`https://${host}`, name);
}

export function getBaseUrl(env: BaseUrlEnvironment): string {
  if (env.VERCEL_ENV === 'preview') {
    if (env.VERCEL_BRANCH_URL) return vercelOrigin(env.VERCEL_BRANCH_URL, 'VERCEL_BRANCH_URL');
    if (env.VERCEL_URL) return vercelOrigin(env.VERCEL_URL, 'VERCEL_URL');
    throw new Error('Missing VERCEL_BRANCH_URL and VERCEL_URL for preview deployment');
  }

  if (env.VERCEL_ENV === 'production') {
    if (env.VERCEL_PROJECT_PRODUCTION_URL) {
      return vercelOrigin(env.VERCEL_PROJECT_PRODUCTION_URL, 'VERCEL_PROJECT_PRODUCTION_URL');
    }
    throw new Error('Missing VERCEL_PROJECT_PRODUCTION_URL for production deployment');
  }

  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'development') {
    throw new Error(`Unsupported VERCEL_ENV: ${env.VERCEL_ENV}`);
  }
  if (env.PROD && !env.VERCEL_ENV) {
    throw new Error('Missing VERCEL_ENV; enable Vercel system environment variables for deployments');
  }
  return 'http://localhost:4321';
}
