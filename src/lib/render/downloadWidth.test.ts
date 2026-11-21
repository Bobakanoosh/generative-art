import { describe, expect, it } from 'vitest';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import { pngDownloadWidth } from './downloadWidth';
import { WIDTH_LADDER } from './widthLadder';

describe('pngDownloadWidth', () => {
  it('gives a build 4096 whatever its step count', () => {
    expect(pngDownloadWidth(false, undefined)).toBe(4096);
    expect(pngDownloadWidth(false, 1)).toBe(4096);
    expect(pngDownloadWidth(false, MAX_STOP_STEP)).toBe(4096);
  });
  it('gives a live piece without a stop step 4096', () => {
    expect(pngDownloadWidth(true, undefined)).toBe(4096);
  });
  it('steps a live moment down by its stop step', () => {
    expect(pngDownloadWidth(true, 1)).toBe(4096);
    expect(pngDownloadWidth(true, 20_000)).toBe(4096);
    expect(pngDownloadWidth(true, 20_001)).toBe(2400);
    expect(pngDownloadWidth(true, 50_000)).toBe(2400);
    expect(pngDownloadWidth(true, 50_001)).toBe(1200);
    expect(pngDownloadWidth(true, MAX_STOP_STEP)).toBe(1200);
  });
  it('only asks for width-ladder rungs', () => {
    for (const n of [undefined, 1, 30_000, 90_000]) {
      for (const live of [true, false]) {
        expect(WIDTH_LADDER).toContain(pngDownloadWidth(live, n));
      }
    }
  });
});
