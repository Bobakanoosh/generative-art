import { describe, expect, it } from 'vitest';
import { hashText, recordingContext, runProbe } from './probe';

describe('hashText', () => {
  it('matches pinned vectors', () => {
    expect(hashText('')).toBe('811c9dc5' + '9e3779b9');
    expect(hashText('abc')).toBe('1a47e90b' + '58756287');
  });
  it('is 16 hex chars and sensitive to input', () => {
    expect(hashText('a')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText('a')).not.toBe(hashText('b'));
  });
});

describe('recordingContext', () => {
  it('hashes call order and property sets', () => {
    const run = (order: number[]) => {
      const r = recordingContext();
      for (const n of order) r.ctx.lineTo(n, n * 0.5);
      r.ctx.fillStyle = '#fff';
      return r.hash();
    };
    expect(run([1, 2])).toBe(run([1, 2]));
    expect(run([1, 2])).not.toBe(run([2, 1]));
  });
  it('distinguishes -0 from 0 (String(-0) is "0")', () => {
    const a = recordingContext();
    a.ctx.moveTo(-0, 1);
    const b = recordingContext();
    b.ctx.moveTo(0, 1);
    expect(a.hash()).not.toBe(b.hash());
  });
  it('distinguishes property values', () => {
    const a = recordingContext();
    a.ctx.globalAlpha = 0.5;
    const b = recordingContext();
    b.ctx.globalAlpha = 0.25;
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe('runProbe', () => {
  it('is stable across runs and covers every piece', () => {
    const a = runProbe();
    const b = runProbe();
    expect(a).toEqual(b);
    const keys = Object.keys(a);
    expect(keys.some((k) => k.startsWith('flow-ribbons@v1:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('murmuration@v1:') && k.endsWith('+input'))).toBe(true);
    for (const h of Object.values(a)) expect(h).toMatch(/^[0-9a-f]{16}$/);
  }, 120_000);
});
