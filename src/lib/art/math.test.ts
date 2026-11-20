import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PI, TAU, HALF_PI, sin, cos, tan, atan, atan2, exp, log, pow, hypot,
  lerp, clamp, map, smoothstep,
} from './math';

const N = 10_000;
const xs = Array.from({ length: N }, (_, i) => -1000 + (2000 * i) / (N - 1));

describe('constants', () => {
  it('match the doubles nearest to pi multiples', () => {
    expect(PI).toBe(Math.PI);
    expect(TAU).toBe(2 * Math.PI);
    expect(HALF_PI).toBe(Math.PI / 2);
  });
});

describe('sin / cos / tan', () => {
  it('sin within 1e-12 of Math.sin on [-1000, 1000]', () => {
    for (const x of xs) expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-12);
  });
  it('cos within 1e-12 of Math.cos on [-1000, 1000]', () => {
    for (const x of xs) expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-12);
  });
  it('tan within 1e-9 relative where |cos| > 1e-3', () => {
    for (const x of xs) {
      if (Math.abs(Math.cos(x)) <= 1e-3) continue;
      const ref = Math.tan(x);
      expect(Math.abs(tan(x) - ref) / Math.max(1, Math.abs(ref))).toBeLessThan(1e-9);
    }
  });
  it('large arguments (Payne–Hanek): within 1e-12 of Math.* and inside [-1, 1]', () => {
    const big = [
      1.6e6, 1647099.3, 2e6, 1e7, 1e10, 1e15, 1e20, 1e22, 1e100, 1e300,
      1.7976931348623157e308, 6381956970095103 * 2 ** 797, // near-multiple of pi/2
    ];
    for (const b of big) {
      for (const x of [b, -b]) {
        const s = sin(x);
        const c = cos(x);
        expect(Math.abs(s - Math.sin(x)), `sin(${x})`).toBeLessThan(1e-12);
        expect(Math.abs(c - Math.cos(x)), `cos(${x})`).toBeLessThan(1e-12);
        expect(Math.abs(s)).toBeLessThanOrEqual(1);
        expect(Math.abs(c)).toBeLessThanOrEqual(1);
        if (Math.abs(Math.cos(x)) > 1e-3) {
          expect(Math.abs(tan(x) - Math.tan(x)) / Math.max(1, Math.abs(Math.tan(x)))).toBeLessThan(1e-9);
        }
      }
    }
  });
  it('large arguments: dense sweep across magnitudes stays accurate', () => {
    for (let k = 0; k < 2000; k++) {
      const x = 1e6 * 1.4 ** (k / 4) * (k % 2 === 0 ? 1 : -1);
      if (!Number.isFinite(x)) break;
      expect(Math.abs(sin(x) - Math.sin(x)), `sin(${x})`).toBeLessThan(1e-12);
      expect(Math.abs(cos(x) - Math.cos(x)), `cos(${x})`).toBeLessThan(1e-12);
    }
  });
  it('edge cases', () => {
    expect(Number.isNaN(sin(-Infinity))).toBe(true);
    expect(Number.isNaN(cos(NaN))).toBe(true);
    expect(Number.isNaN(tan(Infinity))).toBe(true);
    expect(Object.is(sin(0), 0)).toBe(true);
    expect(Object.is(sin(-0), -0)).toBe(true);
    expect(Object.is(tan(-0), -0)).toBe(true);
    expect(cos(0)).toBe(1);
    expect(Number.isNaN(sin(Infinity))).toBe(true);
    expect(Number.isNaN(cos(-Infinity))).toBe(true);
    expect(Number.isNaN(sin(NaN))).toBe(true);
    expect(Number.isNaN(tan(NaN))).toBe(true);
  });
});

describe('atan / atan2', () => {
  it('atan within 1e-12 of Math.atan', () => {
    for (const x of xs) expect(Math.abs(atan(x / 50) - Math.atan(x / 50))).toBeLessThan(1e-12);
    expect(atan(Infinity)).toBe(HALF_PI);
    expect(atan(-Infinity)).toBe(-HALF_PI);
    expect(Object.is(atan(-0), -0)).toBe(true);
  });
  it('atan2 within 1e-12 of Math.atan2 over a grid including axes', () => {
    const steps = 81; // includes exact 0 at the middle
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const y = -10 + (20 * i) / (steps - 1);
        const x = -10 + (20 * j) / (steps - 1);
        expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-12);
      }
    }
    expect(atan2(0, 0)).toBe(0);
  });
  it('atan2 special values match Math.atan2', () => {
    const vals = [0, -0, 1, -1, Infinity, -Infinity, NaN, 1e-310, -1e300];
    for (const y of vals) for (const x of vals) {
      const ref = Math.atan2(y, x);
      const got = atan2(y, x);
      if (Number.isNaN(ref)) expect(Number.isNaN(got)).toBe(true);
      else expect(Math.abs(got - ref)).toBeLessThan(1e-15);
      if (ref === 0) expect(Object.is(got, ref)).toBe(true);
    }
  });
});

describe('exp', () => {
  it('relative error < 1e-12 on [-700, 700]', () => {
    for (let i = 0; i < N; i++) {
      const x = -700 + (1400 * i) / (N - 1);
      const ref = Math.exp(x);
      expect(Math.abs(exp(x) - ref) / ref).toBeLessThan(1e-12);
    }
  });
  it('edge cases', () => {
    expect(exp(0)).toBe(1);
    expect(exp(1000)).toBe(Infinity);
    expect(exp(Infinity)).toBe(Infinity);
    expect(exp(-1000)).toBe(0);
    expect(exp(-Infinity)).toBe(0);
    expect(Number.isNaN(exp(NaN))).toBe(true);
    expect(exp(709.7)).toBeGreaterThan(1e308);
    expect(Number.isFinite(exp(709.7))).toBe(true);
    const sub = exp(-740); // subnormal result
    expect(sub).toBeGreaterThan(0);
    expect(Math.abs(sub - Math.exp(-740)) / Math.exp(-740)).toBeLessThan(1e-6);
  });
});

describe('log', () => {
  it('absolute error < 1e-12 on [1e-300, 1e300] (log-spaced)', () => {
    for (let i = 0; i < N; i++) {
      const x = 10 ** (-300 + (600 * i) / (N - 1));
      expect(Math.abs(log(x) - Math.log(x))).toBeLessThan(1e-12);
    }
  });
  it('edge cases', () => {
    expect(log(0)).toBe(-Infinity);
    expect(log(-0)).toBe(-Infinity);
    expect(Number.isNaN(log(-1))).toBe(true);
    expect(Number.isNaN(log(NaN))).toBe(true);
    expect(log(Infinity)).toBe(Infinity);
    expect(log(1)).toBe(0);
    expect(Math.abs(log(5e-324) - Math.log(5e-324))).toBeLessThan(1e-12);
    expect(Math.abs(log(2.5e-310) - Math.log(2.5e-310))).toBeLessThan(1e-12);
    expect(Math.abs(log(Number.MAX_VALUE) - Math.log(Number.MAX_VALUE))).toBeLessThan(1e-12);
  });
});

describe('pow', () => {
  it('relative error < 1e-11 for x in [0.01, 100], y in [-10, 10]', () => {
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 100; j++) {
        const x = 0.01 + (99.99 * i) / 99;
        const y = -10 + (20 * j) / 99;
        const ref = Math.pow(x, y);
        expect(Math.abs(pow(x, y) - ref) / ref).toBeLessThan(1e-11);
      }
    }
  });
  it('special cases', () => {
    expect(pow(-2, 3)).toBe(-8);
    expect(pow(-2, 2)).toBe(4);
    expect(pow(2, 10)).toBe(1024);
    expect(pow(2, -2)).toBe(0.25);
    expect(pow(0, 2)).toBe(0);
    expect(pow(0, -1)).toBe(Infinity);
    expect(Object.is(pow(-0, 3), -0)).toBe(true);
    for (const x of [0, -3, 2.5, NaN, Infinity]) expect(pow(x, 0)).toBe(1);
    expect(Number.isNaN(pow(-2, 0.5))).toBe(true);
    expect(Number.isNaN(pow(2, NaN))).toBe(true);
    expect(pow(Infinity, 2)).toBe(Infinity);
    expect(pow(-Infinity, 3)).toBe(-Infinity);
    expect(pow(2, Infinity)).toBe(Infinity);
    expect(pow(0.5, Infinity)).toBe(0);
    expect(pow(10, 400)).toBe(Infinity);
    expect(pow(10, -400)).toBe(0);
  });
});

describe('hypot', () => {
  it('basics and scaling', () => {
    expect(hypot(3, 4)).toBe(5);
    expect(hypot(0, 0)).toBe(0);
    expect(hypot(-3, 4)).toBe(5);
    expect(Number.isFinite(hypot(3e300, 4e300))).toBe(true);
    expect(hypot(3e300, 4e300) / 5e300).toBeCloseTo(1, 12);
    expect(hypot(3e-300, 4e-300) / 5e-300).toBeCloseTo(1, 12);
    expect(hypot(Infinity, NaN)).toBe(Infinity);
    expect(Number.isNaN(hypot(NaN, 1))).toBe(true);
  });
});

describe('interpolation helpers', () => {
  it('lerp / clamp / map / smoothstep', () => {
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(lerp(2, 4, 0)).toBe(2);
    expect(lerp(2, 4, 1)).toBe(4);
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.3, 0, 1)).toBe(0.3);
    expect(map(5, 0, 10, 100, 200)).toBe(150);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe('determinism rule', () => {
  it('toolkit sources use no engine-dependent Math functions', () => {
    const banned =
      /Math\.(random|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b|\*\*/;
    for (const f of ['math.ts', 'rng.ts', 'noise.ts', 'color.ts']) {
      const src = readFileSync(path.join(__dirname, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(banned.test(src), f).toBe(false);
    }
  });
});
