import { describe, expect, test } from 'bun:test';
import { getBaseUrl } from './base-url.ts';

describe('getBaseUrl', () => {
  test('uses the configured production origin before the Vercel production domain', () => {
    expect(getBaseUrl({
      VERCEL_ENV: 'production',
      SITE_URL: 'https://example.com/',
      VERCEL_PROJECT_PRODUCTION_URL: 'example.vercel.app',
    })).toBe('https://example.com');
  });

  test('falls back to the Vercel production domain', () => {
    expect(getBaseUrl({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'example.vercel.app',
    })).toBe('https://example.vercel.app');
  });

  test('uses the branch URL for previews, ignoring SITE_URL', () => {
    expect(getBaseUrl({
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'branch.vercel.app',
      VERCEL_URL: 'deployment.vercel.app',
      SITE_URL: 'https://example.com',
    })).toBe('https://branch.vercel.app');
  });

  test('falls back to the deployment URL for previews', () => {
    expect(getBaseUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'deployment.vercel.app' }))
      .toBe('https://deployment.vercel.app');
  });

  test('uses the configured local origin or the development default', () => {
    expect(getBaseUrl({ SITE_URL: 'http://localhost:3000/' })).toBe('http://localhost:3000');
    expect(getBaseUrl({ VERCEL_ENV: 'development' })).toBe('http://localhost:4321');
    expect(getBaseUrl({})).toBe('http://localhost:4321');
  });

  test('fails instead of creating broken deployed links', () => {
    expect(() => getBaseUrl({ VERCEL_ENV: 'preview' })).toThrow('Missing VERCEL_BRANCH_URL');
    expect(() => getBaseUrl({ VERCEL_ENV: 'production' })).toThrow('Missing SITE_URL');
    expect(() => getBaseUrl({ PROD: true })).toThrow('Missing SITE_URL');
    expect(() => getBaseUrl({ VERCEL_ENV: 'unexpected' })).toThrow('Unsupported VERCEL_ENV');
  });

  test('rejects invalid or unsafe configured origins', () => {
    for (const SITE_URL of ['not-a-url', 'https://example.com/path', 'https://user@example.com', 'http://example.com']) {
      expect(() => getBaseUrl({ VERCEL_ENV: 'production', SITE_URL })).toThrow('Invalid SITE_URL');
    }
    for (const VERCEL_URL of ['https://example.com', 'example.com/path', 'user@example.com']) {
      expect(() => getBaseUrl({ VERCEL_ENV: 'preview', VERCEL_URL })).toThrow('Invalid VERCEL_URL');
    }
  });
});
