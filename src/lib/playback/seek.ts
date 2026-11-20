/** Pure helpers for the player's progress-bar seeking (pointer and keyboard). */

/** Nearest step at `fraction` of the track, clamped to [0, total]. */
export function stepAtFraction(fraction: number, total: number): number {
  if (total <= 0 || !Number.isFinite(fraction)) return 0;
  return Math.min(total, Math.max(0, Math.round(fraction * total)));
}

/**
 * Target step for a key press on the focused progress slider, or null when the
 * key isn't a seek key. Arrows move 1% of the build (at least one step), Page
 * keys 10%, Home/End jump to the ends.
 */
export function keySeekStep(key: string, index: number, total: number): number | null {
  const small = Math.max(1, Math.round(total / 100));
  const large = Math.max(1, Math.round(total / 10));
  let next: number;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = index + small;
      break;
    case 'ArrowLeft':
    case 'ArrowDown':
      next = index - small;
      break;
    case 'PageUp':
      next = index + large;
      break;
    case 'PageDown':
      next = index - large;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = total;
      break;
    default:
      return null;
  }
  return Math.min(total, Math.max(0, next));
}
