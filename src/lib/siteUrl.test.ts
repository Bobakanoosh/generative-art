import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from './siteUrl';

describe('resolveSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://art.example', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe(
      'https://art.example',
    );
  });
  it("falls back to Vercel's production domain (no scheme in the env var)", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'gen-art.vercel.app' })).toBe('https://gen-art.vercel.app');
  });
  it('falls back to localhost, treating empty values as unset', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '', VERCEL_PROJECT_PRODUCTION_URL: '' })).toBe('http://localhost:3000');
  });
});
