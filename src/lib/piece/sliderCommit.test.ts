import { describe, expect, it } from 'vitest';
import { createSliderCommit } from './sliderCommit';

/** Drives a tracker the way RangeSlider does, recording what it would send. */
function driver() {
  const t = createSliderCommit();
  const calls: [number, boolean][] = [];
  return {
    calls,
    input(v: number) {
      t.input();
      calls.push([v, true]);
    },
    release(v: number) {
      if (t.commit()) calls.push([v, false]);
    },
  };
}

describe('createSliderCommit', () => {
  it('drag: every input is live, release commits the final value once', () => {
    const d = driver();
    d.input(1);
    d.input(2);
    d.input(3);
    // A release fires several events (pointerup, change); only the first commits.
    d.release(3);
    d.release(3);
    expect(d.calls).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [3, false],
    ]);
  });

  it('a release with no drag in between commits nothing', () => {
    const t = createSliderCommit();
    expect(t.commit()).toBe(false);
  });

  it('keyboard: each key press is a live input then a commit; keyup after commits nothing', () => {
    const d = driver();
    d.input(4); // input event
    d.release(4); // change event
    d.release(4); // keyup
    d.input(5);
    d.release(5);
    expect(d.calls).toEqual([
      [4, true],
      [4, false],
      [5, true],
      [5, false],
    ]);
  });
});
