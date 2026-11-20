/**
 * Viewer-only playback pacing. Maps elapsed playback time to how many steps of
 * a build should be drawn. Never affects the pixels of the final image.
 */

export type Speed = 0.5 | 1 | 2 | 'instant';

export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 'instant'];

/** Build length at 1x speed, in milliseconds. */
export const BUILD_DURATION_MS = 10_000;

/** Per-animation-frame step budget, in milliseconds. */
export const FRAME_BUDGET_MS = 12;

/** Ease curve for build progress: slow start, faster finish. */
export function easeBuild(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c ** 1.6;
}

/**
 * Integer step to draw at `elapsedMs` of playback at `speed`, in [0, total].
 * Reaches `total` once `elapsedMs * speed >= BUILD_DURATION_MS`.
 */
export function targetStep(
  total: number,
  elapsedMs: number,
  speed: Exclude<Speed, 'instant'>,
): number {
  if (total <= 0) return 0;
  const progress = (elapsedMs * speed) / BUILD_DURATION_MS;
  return Math.floor(total * easeBuild(progress));
}

/**
 * Converts authored phase markers (absolute step indices) into fractions of the
 * build. Phases outside [0, total] are dropped; the result is sorted by position.
 */
export function phaseFractions(
  phases: { at: number; label: string }[] | undefined,
  total: number,
): { fraction: number; label: string }[] {
  if (!phases) return [];
  return phases
    .filter((p) => p.at >= 0 && p.at <= total)
    .map((p) => ({
      fraction: total > 0 ? Math.min(1, Math.max(0, p.at / total)) : 0,
      label: p.label,
    }))
    .sort((a, b) => a.fraction - b.fraction);
}
