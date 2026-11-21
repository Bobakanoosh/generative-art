/**
 * Compact, deterministic record of the input a live session fed a piece.
 * Pointer coordinates are stored quantized (logical units x POINTER_QUANTUM as
 * integers) so replays on the server match the live browser exactly.
 */
import type { InputFrame } from '@/lib/piece/types';

export const POINTER_QUANTUM = 10; // stored ints = logical x 10
export const MAX_INPUT_EVENTS = 30_000;
export const MAX_KEY_LENGTH = 16;

/**
 * p: pointer changes, [dStep] = pointer gone, [dStep, qx, qy, down(0|1)];
 * k: key presses [dStep, key]. dStep is relative to the previous entry of the
 * same list (first: relative to step 0).
 */
export interface InputLog {
  p: number[][];
  k: [number, string][];
}

export const EMPTY_LOG: InputLog = { p: [], k: [] };

/** Logical units -> stored integer. Never returns -0. */
export function quantize(v: number): number {
  return Math.round(v * POINTER_QUANTUM) + 0;
}

export function eventCount(log: InputLog): number {
  return log.p.length + log.k.length;
}

export function isEmptyLog(log: InputLog): boolean {
  return eventCount(log) === 0;
}

/**
 * Stateful frame source; queries must be non-decreasing in `i` (the runner's
 * order). Each call returns fresh objects equal to what the recorder produced.
 */
export function replaySource(log: InputLog): (i: number) => InputFrame {
  const pSteps: number[] = [];
  let acc = 0;
  for (const e of log.p) pSteps.push((acc += e[0]));
  const kSteps: number[] = [];
  acc = 0;
  for (const e of log.k) kSteps.push((acc += e[0]));

  let pi = 0; // next pointer entry not yet applied
  let current: number[] | null = null; // last applied entry with a pointer, or null
  let ki = 0; // first key entry at or after the query step

  return (i: number): InputFrame => {
    while (pi < log.p.length && pSteps[pi] <= i) {
      const e = log.p[pi];
      current = e.length >= 4 ? e : null;
      pi++;
    }
    while (ki < log.k.length && kSteps[ki] < i) ki++;
    const keys: string[] = [];
    for (let j = ki; j < log.k.length && kSteps[j] === i; j++) keys.push(log.k[j][1]);
    return {
      pointer: current
        ? { x: current[1] / POINTER_QUANTUM, y: current[2] / POINTER_QUANTUM, down: current[3] === 1 }
        : null,
      keys,
    };
  };
}

type Validation = { ok: true; log: InputLog } | { ok: false; error: string };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Validate untrusted input; returns a fresh, clean copy on success. */
export function validateInputLog(
  raw: unknown,
  bounds: { width: number; height: number; n: number },
): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('input must be an object');
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'p' && key !== 'k') return fail(`unexpected key "${key}"`);
  }
  if (!Array.isArray(obj.p) || !Array.isArray(obj.k)) return fail('input needs arrays p and k');
  if (obj.p.length + obj.k.length > MAX_INPUT_EVENTS) return fail('too many input events');

  const maxQx = Math.round(bounds.width * POINTER_QUANTUM);
  const maxQy = Math.round(bounds.height * POINTER_QUANTUM);

  const p: number[][] = [];
  let step = 0;
  for (let idx = 0; idx < obj.p.length; idx++) {
    const e: unknown = obj.p[idx];
    if (!Array.isArray(e) || (e.length !== 1 && e.length !== 4)) return fail(`bad pointer entry ${idx}`);
    const d: unknown = e[0];
    if (!isInt(d) || d < 0) return fail(`bad pointer step in entry ${idx}`);
    if (idx > 0 && d < 1) return fail(`pointer entry ${idx} repeats a step`);
    step += d;
    if (step >= bounds.n) return fail(`pointer entry ${idx} is at or beyond step n`);
    if (e.length === 1) {
      p.push([d]);
      continue;
    }
    const [, qx, qy, down] = e as unknown[];
    if (!isInt(qx) || qx < 0 || qx > maxQx) return fail(`pointer x out of range in entry ${idx}`);
    if (!isInt(qy) || qy < 0 || qy > maxQy) return fail(`pointer y out of range in entry ${idx}`);
    if (down !== 0 && down !== 1) return fail(`pointer down must be 0 or 1 in entry ${idx}`);
    p.push([d, qx + 0, qy + 0, down]); // + 0 turns -0 into 0
  }

  const k: [number, string][] = [];
  step = 0;
  for (let idx = 0; idx < obj.k.length; idx++) {
    const e: unknown = obj.k[idx];
    if (!Array.isArray(e) || e.length !== 2) return fail(`bad key entry ${idx}`);
    const [d, key] = e as unknown[];
    if (!isInt(d) || d < 0) return fail(`bad key step in entry ${idx}`);
    if (typeof key !== 'string' || key.length < 1 || key.length > MAX_KEY_LENGTH) {
      return fail(`bad key in entry ${idx}`);
    }
    step += d;
    if (step >= bounds.n) return fail(`key entry ${idx} is at or beyond step n`);
    k.push([d, key]);
  }

  return { ok: true, log: { p, k } };
}
