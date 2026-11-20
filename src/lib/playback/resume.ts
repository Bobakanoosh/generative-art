import type { Motion } from '@/lib/piece/generationState';
import type { Generation } from '@/lib/piece/types';

/** Where a playback was when its canvas was torn down (e.g. by a resize). */
export interface ResumePoint {
  gen: Generation;
  index: number;
  playing: boolean;
  done: boolean;
}

/**
 * How to start the playback for `gen` given where the previous one was. The
 * same generation (a canvas resize) carries on where it was — finished builds
 * redraw at once, others return to the same step, paused or playing as before.
 * A new generation starts from 0 and autoplays; 'instant' motion finishes at once.
 */
export function resumeOptions(
  last: ResumePoint | null,
  gen: Generation,
  motion: Motion,
): { startAt: number; autoplay: boolean; finish: boolean } {
  const same = last !== null && last.gen === gen;
  if (motion === 'instant' || (same && last.done)) return { startAt: 0, autoplay: false, finish: true };
  if (same) return { startAt: last.index, autoplay: last.playing, finish: false };
  return { startAt: 0, autoplay: true, finish: false };
}
