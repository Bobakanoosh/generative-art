import { describe, expect, it } from 'vitest';
import { fitRenderWidth } from './fitWidth';
import { snapWidth, WIDTH_LADDER } from './widthLadder';

describe('snapWidth', () => {
  it('snaps up to the smallest ladder width >= requested', () => {
    expect(snapWidth(1, 1)).toBe(256);
    expect(snapWidth(256, 1)).toBe(256);
    expect(snapWidth(257, 1)).toBe(400);
    expect(snapWidth(1000, 1)).toBe(1200);
    expect(snapWidth(1200, 1)).toBe(1200);
  });
  it('caps at 4096', () => {
    expect(snapWidth(5000, 1)).toBe(4096);
    expect(snapWidth(4096, 1)).toBe(4096);
  });
  it('keeps 1200 for a 4:5 piece and applies fitRenderWidth for a very tall aspect', () => {
    expect(snapWidth(1200, 0.8)).toBe(1200);
    expect(snapWidth(4096, 0.25)).toBe(fitRenderWidth(4096, 0.25));
    expect(snapWidth(4096, 0.25)).toBe(1024);
  });
  it('ladder is ascending', () => {
    expect([...WIDTH_LADDER]).toEqual([...WIDTH_LADDER].sort((a, b) => a - b));
  });
});
