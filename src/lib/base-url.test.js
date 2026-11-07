import { describe, expect, test } from 'bun:test';
import { getBaseUrl } from './base-url.ts';

describe('getBaseUrl', () => {
  test('uses the Vercel production domain, not the deployment URL', () => {
    expect(getBaseUrl({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'example.vercel.app',
      VERCEL_URL: 'deployment.vercel.app',
    })).toBe('https://example.vercel.app');
  });

  test('uses the branch URL for previews', () => {
    expect(getBaseUrl({
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'branch.vercel.app',
      VERCEL_URL: 'deployment.vercel.app',
    })).toBe('https://branch.vercel.app');
  });

  test('falls back to the deployment URL for previews', () => {
    expect(getBaseUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'deployment.vercel.app' }))
      .toBe('https://deployment.vercel.app');
  });

  test('uses the development default locally', () => {
    expect(getBaseUrl({ VERCEL_ENV: 'development' })).toBe('http://localhost:4321');
    expect(getBaseUrl({})).toBe('http://localhost:4321');
  });

  test('fails instead of creating broken deployed links', () => {
    expect(() => getBaseUrl({ VERCEL_ENV: 'preview' })).toThrow('Missing VERCEL_BRANCH_URL');
    expect(() => getBaseUrl({ VERCEL_ENV: 'production' })).toThrow('Missing VERCEL_PROJECT_PRODUCTION_URL');
    expect(() => getBaseUrl({ PROD: true })).toThrow('Missing VERCEL_ENV');
    expect(() => getBaseUrl({ VERCEL_ENV: 'unexpected' })).toThrow('Unsupported VERCEL_ENV');
  });

  test('rejects invalid or unsafe configured origins', () => {
    for (const VERCEL_PROJECT_PRODUCTION_URL of ['https://example.com', 'example.com/path', 'user@example.com']) {
      expect(() => getBaseUrl({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL }))
        .toThrow('Invalid VERCEL_PROJECT_PRODUCTION_URL');
    }
    for (const VERCEL_URL of ['https://example.com', 'example.com/path', 'user@example.com']) {
      expect(() => getBaseUrl({ VERCEL_ENV: 'preview', VERCEL_URL })).toThrow('Invalid VERCEL_URL');
    }
  });
});
