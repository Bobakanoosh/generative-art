export interface RateLimiter {
  take(key: string): boolean;
  reset(): void;
}

/** Sliding-window limiter, in memory (per server instance). */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number; maxKeys?: number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 5000;
  const hits = new Map<string, number[]>();
  let lastSweep = now();
  return {
    take(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((h) => t - h < opts.windowMs);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      // Re-insert so Map order is least-recently-used first.
      hits.delete(key);
      hits.set(key, recent);
      // Sweep expired keys at most once per window, then hard-cap the map
      // (evicting the stalest keys) so rotating keys cannot grow it unbounded.
      if (t - lastSweep >= opts.windowMs) {
        lastSweep = t;
        for (const [k, v] of hits) if (v.every((h) => t - h >= opts.windowMs)) hits.delete(k);
      }
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

/** x-vercel-forwarded-for (set by Vercel) -> x-real-ip -> 'unknown'. x-forwarded-for is client-spoofable and not trusted. */
export function clientIp(headers: Headers): string {
  const vercel = headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
  if (vercel) return vercel;
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Saves per IP: 10 per 10 minutes (per server instance). */
export const captureLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });
