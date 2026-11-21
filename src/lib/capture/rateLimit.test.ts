import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from './rateLimit';

describe('rate limiter', () => {
  it('allows 10 then blocks the 11th, and frees after the window', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 10, windowMs: 600_000, now: () => t });
    for (let i = 0; i < 10; i++) expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
    expect(rl.take('b')).toBe(true);
    t = 599_999;
    expect(rl.take('a')).toBe(false);
    t = 600_000;
    expect(rl.take('a')).toBe(true);
  });
  it('reset clears', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    rl.take('a');
    expect(rl.take('a')).toBe(false);
    rl.reset();
    expect(rl.take('a')).toBe(true);
  });
});

describe('rate limiter memory bounds', () => {
  it('caps live keys, evicts oldest, and sweeps at most once per window', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t, maxKeys: 5000 });
    for (let i = 0; i < 6000; i++) {
      t += 0.01; // all 6000 keys stay live inside one window
      expect(rl.take(`k${i}`)).toBe(true);
    }
    // oldest keys were evicted (fresh again), newest are still limited
    expect(rl.take('k0')).toBe(true);
    expect(rl.take('k5999')).toBe(false);
    const iter = Map.prototype[Symbol.iterator];
    let sweeps = 0;
    Map.prototype[Symbol.iterator] = function (this: Map<unknown, unknown>) {
      sweeps++;
      return iter.call(this);
    } as typeof iter;
    try {
      for (let i = 0; i < 100; i++) rl.take(`z${i}`); // same window: no sweeps
      expect(sweeps).toBe(0);
      t += 2000;
      rl.take('after');
      expect(sweeps).toBeGreaterThan(0);
    } finally {
      Map.prototype[Symbol.iterator] = iter;
    }
  });
});

describe('clientIp', () => {
  it('ignores x-forwarded-for; prefers x-vercel-forwarded-for, then x-real-ip, then unknown', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('unknown');
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(new Headers({ 'x-vercel-forwarded-for': '4.4.4.4', 'x-real-ip': '3.3.3.3' }))).toBe('4.4.4.4');
    expect(clientIp(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
