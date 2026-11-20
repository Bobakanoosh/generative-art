import { describe, expect, it } from 'vitest';
import {
  BUILD_DURATION_MS,
  FRAME_BUDGET_MS,
  SPEEDS,
  easeBuild,
  phaseFractions,
  targetStep,
} from './pacing';

describe('constants', () => {
  it('exposes the agreed speeds, duration and frame budget', () => {
    expect(SPEEDS).toEqual([0.5, 1, 2, 'instant']);
    expect(BUILD_DURATION_MS).toBe(10_000);
    expect(FRAME_BUDGET_MS).toBe(12);
  });
});

describe('easeBuild', () => {
  it('maps the endpoints to themselves', () => {
    expect(easeBuild(0)).toBe(0);
    expect(easeBuild(1)).toBe(1);
  });

  it('applies t ** 1.6', () => {
    expect(easeBuild(0.5)).toBeCloseTo(0.3299, 4);
  });

  it('clamps input to [0, 1]', () => {
    expect(easeBuild(-1)).toBe(0);
    expect(easeBuild(2)).toBe(1);
  });
});

describe('targetStep', () => {
  it('starts at 0 and ends at total', () => {
    expect(targetStep(320, 0, 1)).toBe(0);
    expect(targetStep(320, 10_000, 1)).toBe(320);
  });

  it('scales elapsed time by speed', () => {
    expect(targetStep(320, 5_000, 2)).toBe(320);
    expect(targetStep(320, 20_000, 0.5)).toBe(320);
  });

  it('returns total for an empty-ish overshoot without exceeding total', () => {
    expect(targetStep(320, 999_999, 2)).toBe(320);
  });

  it('is 0 when total is 0', () => {
    expect(targetStep(0, 0, 1)).toBe(0);
    expect(targetStep(0, 5_000, 1)).toBe(0);
  });

  it('is monotonic non-decreasing and always an integer over 0..12000ms', () => {
    let prev = -1;
    for (let ms = 0; ms <= 12_000; ms += 16) {
      const s = targetStep(320, ms, 1);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(320);
      prev = s;
    }
  });
});

describe('phaseFractions', () => {
  it('normalises, sorts and labels phases', () => {
    expect(
      phaseFractions(
        [
          { at: 160, label: 'b' },
          { at: 0, label: 'a' },
        ],
        320,
      ),
    ).toEqual([
      { fraction: 0, label: 'a' },
      { fraction: 0.5, label: 'b' },
    ]);
  });

  it('returns [] for undefined phases', () => {
    expect(phaseFractions(undefined, 320)).toEqual([]);
  });

  it('drops phases outside [0, total] and clamps nothing else away', () => {
    expect(
      phaseFractions(
        [
          { at: -5, label: 'neg' },
          { at: 320, label: 'end' },
          { at: 400, label: 'over' },
        ],
        320,
      ),
    ).toEqual([{ fraction: 1, label: 'end' }]);
  });
});
