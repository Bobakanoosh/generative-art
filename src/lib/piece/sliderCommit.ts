/**
 * Range-slider release tracking: every `input` is a live change; the first
 * release event after it (pointerup, keyup or native change, whichever comes
 * first) commits once, and the rest are ignored.
 */
export interface SliderCommit {
  /** Record a live change. */
  input(): void;
  /** True exactly once per run of live changes: the caller sends the commit. */
  commit(): boolean;
}

export function createSliderCommit(): SliderCommit {
  let dirty = false;
  return {
    input() {
      dirty = true;
    },
    commit() {
      if (!dirty) return false;
      dirty = false;
      return true;
    },
  };
}
