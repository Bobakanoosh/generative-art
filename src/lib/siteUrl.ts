type SiteEnv = { NEXT_PUBLIC_SITE_URL?: string; VERCEL_PROJECT_PRODUCTION_URL?: string };

/**
 * Absolute site origin for metadata (OG image URLs): the explicit
 * NEXT_PUBLIC_SITE_URL, else Vercel's production domain (given without a
 * scheme), else local dev.
 */
export function resolveSiteUrl(env: SiteEnv): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}
