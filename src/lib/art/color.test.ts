import { describe, expect, it } from 'vitest';
import { hexToRgb, mixHex, oklch, rgba } from './color';

describe('color', () => {
  it('hexToRgb accepts #rgb and #rrggbb', () => {
    expect(hexToRgb('#f80')).toEqual([255, 136, 0]);
    expect(hexToRgb('#FF8800')).toEqual([255, 136, 0]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(() => hexToRgb('nope')).toThrow();
    expect(() => hexToRgb('#12345')).toThrow();
  });
  it('rgba formats', () => {
    expect(rgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(rgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });
  it('oklch endpoints', () => {
    expect(oklch(1, 0, 0)).toBe('rgba(255, 255, 255, 1)');
    expect(oklch(0, 0, 0)).toBe('rgba(0, 0, 0, 1)');
    expect(oklch(0, 0, 0, 0.25)).toBe('rgba(0, 0, 0, 0.25)');
  });
  it('oklch gamut-clips out-of-range chroma', () => {
    const m = /^rgba\((\d+), (\d+), (\d+), 1\)$/.exec(oklch(0.7, 0.4, 145));
    expect(m).not.toBeNull();
    for (const c of m!.slice(1)) {
      expect(Number(c)).toBeGreaterThanOrEqual(0);
      expect(Number(c)).toBeLessThanOrEqual(255);
    }
  });
  it('oklch matches known sRGB primaries', () => {
    expect(oklch(0.62796, 0.25768, 29.2339)).toBe('rgba(255, 0, 0, 1)');
    expect(oklch(0.86644, 0.29483, 142.4953)).toBe('rgba(0, 255, 0, 1)');
    expect(oklch(0.45201, 0.31321, 264.052)).toBe('rgba(0, 0, 255, 1)');
  });
  it('mixHex', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    expect(mixHex('#000', '#fff', 0.25)).toBe('#404040');
  });
});
