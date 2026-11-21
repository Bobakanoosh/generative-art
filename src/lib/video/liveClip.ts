/**
 * Pure helpers for exporting video from a live (endless/interactive) piece:
 * which clip lengths to offer, the frame plan for each, and the state machine
 * of a real-time recorded session.
 */
import { LIVE_STEPS_PER_SECOND, type LiveStatus } from '@/lib/live/live';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { CLIP_SECONDS, clipFramePlan, loopFramePlan } from './plan';

export type ClipSeconds = (typeof CLIP_SECONDS)[number];
export type ClipChoice = { kind: 'clip'; seconds: ClipSeconds } | { kind: 'loop' };

export const DEFAULT_CLIP_SECONDS: ClipSeconds = 10;
/** A recording that ends early (pause, limit) must hold at least this many steps (1 s), else it is dropped. */
export const MIN_RECORDING_STEPS = LIVE_STEPS_PER_SECOND;

/** `loopSteps` is usable: a positive multiple of 4 (whole frames at both 30 and 15 fps). */
export function loopStepsValid(loopSteps: number): boolean {
  return Number.isInteger(loopSteps) && loopSteps > 0 && loopSteps % 4 === 0;
}

/** Select values for the clip-length menu: 5/10/15 s, plus Loop when the piece declares `loopSteps`. */
export function clipChoices(piece: Pick<PieceDefinition, 'loopSteps'>): string[] {
  const choices = CLIP_SECONDS.map(String);
  return piece.loopSteps !== undefined ? [...choices, 'loop'] : choices;
}

export function parseClipChoice(value: string): ClipChoice {
  if (value === 'loop') return { kind: 'loop' };
  const seconds = CLIP_SECONDS.find((s) => String(s) === value);
  return { kind: 'clip', seconds: seconds ?? DEFAULT_CLIP_SECONDS };
}

/** Frame steps for a clip starting at `from` (capped at `max`), or one loop period. */
export function liveFramePlan(choice: ClipChoice, from: number, fps: number, loopSteps?: number, max?: number): number[] {
  if (choice.kind === 'loop') {
    if (loopSteps === undefined || !loopStepsValid(loopSteps)) throw new Error('This piece does not declare a valid loopSteps');
    return loopFramePlan(loopSteps, fps);
  }
  return clipFramePlan(from, choice.seconds, fps, max);
}

/** The generation to export a clip with: an endless runner needs a stop step, so stop at the plan's last frame. */
export function clipGeneration(gen: Generation, frames: readonly number[]): Generation {
  if (frames.length === 0) throw new Error('Empty clip');
  let last = frames[0];
  for (const step of frames) if (step > last) last = step;
  return { ...gen, n: last };
}

/** Download name suffix: seed plus where the clip starts (a loop has no start). */
export function liveClipFileId(seed: string, choice: ClipChoice, from: number): string {
  return choice.kind === 'loop' ? `${seed}-loop` : `${seed}-${from}`;
}

// --- real-time recording (interactive pieces) ----------------------------------

export interface Recording {
  /** Sim step when recording began: the clip's first frame. */
  start: number;
  /** Step at which the recording completes. */
  end: number;
  /** The sim's epoch when recording began: any later epoch means Restart ran (even one at step 0). */
  epoch: number;
}

export type RecordingVerdict =
  | { kind: 'recording'; elapsed: number }
  | { kind: 'finish'; at: number }
  | { kind: 'cancel'; reason: 'restarted' | 'too-short' };

/**
 * Why a running recording can no longer finish, judged outside the sim's own
 * status: the live view failed (a canvas/render error leaves no sim to
 * record), or the sim now runs another generation. Null: nothing interrupted
 * it (a sim that is merely missing for a moment, as during a resize, is not).
 */
export function recordingInterruption(
  recGen: Generation,
  live: { gen: Generation } | null,
  failed: boolean,
): 'failed' | 'changed' | null {
  if (failed) return 'failed';
  if (live && live.gen !== recGen) return 'changed';
  return null;
}

/** Step a `seconds` recording starting at `start` completes, capped at the stop step. */
export function recordingEnd(start: number, seconds: number): number {
  return Math.min(MAX_STOP_STEP, start + seconds * LIVE_STEPS_PER_SECOND);
}

/** Ending a recording now, at sim step `index` (Stop pressed, or the sim stopped): keep it if it holds a second. */
export function stopVerdict(rec: Recording, index: number): RecordingVerdict {
  const at = Math.min(index, rec.end);
  return at - rec.start >= MIN_RECORDING_STEPS ? { kind: 'finish', at } : { kind: 'cancel', reason: 'too-short' };
}

/**
 * What a live status means for a running recording: still recording (whole
 * seconds so far), finished (at the end step, or early when the sim stopped:
 * paused, limit reached, input full), or canceled (Restart ran since it
 * began, seen by the sim's epoch, or took the sim back before the start). A
 * sim catching up after a resize is still recording.
 */
export function recordingVerdict(rec: Recording, status: LiveStatus): RecordingVerdict {
  if (status.epoch !== rec.epoch) return { kind: 'cancel', reason: 'restarted' };
  const elapsed = Math.floor(Math.max(0, status.index - rec.start) / LIVE_STEPS_PER_SECOND);
  if (status.catchingUp) return { kind: 'recording', elapsed };
  if (status.index < rec.start) return { kind: 'cancel', reason: 'restarted' };
  if (status.index >= rec.end) return { kind: 'finish', at: rec.end };
  if (!status.playing) return stopVerdict(rec, status.index);
  return { kind: 'recording', elapsed };
}
