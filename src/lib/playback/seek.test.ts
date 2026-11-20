import { describe, expect, it } from 'vitest';
import { keySeekStep, stepAtFraction } from './seek';

describe('stepAtFraction', () => {
  it('maps a track fraction to the nearest step in [0, total]', () => {
    expect(stepAtFraction(0, 300)).toBe(0);
    expect(stepAtFraction(0.5, 300)).toBe(150);
    expect(stepAtFraction(1, 300)).toBe(300);
    expect(stepAtFraction(0.3333, 10)).toBe(3);
  });

  it('clamps outside the track and handles empty/invalid input', () => {
    expect(stepAtFraction(-0.2, 300)).toBe(0);
    expect(stepAtFraction(1.7, 300)).toBe(300);
    expect(stepAtFraction(Number.NaN, 300)).toBe(0);
    expect(stepAtFraction(0.5, 0)).toBe(0);
  });
});

describe('keySeekStep', () => {
  it('arrows move by 1% of the build (at least one step)', () => {
    expect(keySeekStep('ArrowRight', 100, 1000)).toBe(110);
    expect(keySeekStep('ArrowUp', 100, 1000)).toBe(110);
    expect(keySeekStep('ArrowLeft', 100, 1000)).toBe(90);
    expect(keySeekStep('ArrowDown', 100, 1000)).toBe(90);
    expect(keySeekStep('ArrowRight', 3, 20)).toBe(4);
  });

  it('page keys move by 10%; Home/End jump to the ends', () => {
    expect(keySeekStep('PageUp', 100, 1000)).toBe(200);
    expect(keySeekStep('PageDown', 100, 1000)).toBe(0);
    expect(keySeekStep('Home', 500, 1000)).toBe(0);
    expect(keySeekStep('End', 500, 1000)).toBe(1000);
  });

  it('clamps to [0, total]', () => {
    expect(keySeekStep('ArrowRight', 1000, 1000)).toBe(1000);
    expect(keySeekStep('ArrowLeft', 0, 1000)).toBe(0);
  });

  it('returns null for keys it does not handle', () => {
    expect(keySeekStep('a', 5, 10)).toBeNull();
    expect(keySeekStep('Enter', 5, 10)).toBeNull();
  });
});
