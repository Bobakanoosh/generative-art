/**
 * Live input recorder. The browser feeds it raw pointer/key events; once per
 * simulation step `frame(i)` turns the current state into the InputFrame the
 * piece sees and logs any change, so the log replays to identical frames.
 */
import type { InputFrame } from '@/lib/piece/types';
import { MAX_KEY_LENGTH, POINTER_QUANTUM, quantize, type InputLog } from './log';

const LOGICAL_WIDTH = 1000;

/** Most key presses delivered (and logged) in one step; extras are dropped before delivery. */
export const MAX_KEYS_PER_STEP = 8;
/** Upper bound on events one frame() can log: one pointer change plus the keys. */
export const MAX_EVENTS_PER_STEP = 1 + MAX_KEYS_PER_STEP;

export interface Recorder {
  setPointer(p: { x: number; y: number; down: boolean } | null): void; // logical, unquantized
  pressKey(key: string): void; // ignored if key.length > MAX_KEY_LENGTH
  /** Called once per step, in order: builds the frame from current state, logs changes, drains keys. */
  frame(i: number): InputFrame;
  log(): InputLog; // copy
  /** Number of logged events (pointer + key); O(1). */
  count(): number;
  /** Drop events at steps >= i (resume after rewind). */
  truncate(i: number): void;
}

/** Quantized pointer state: [qx, qy, down], or null when absent. */
type QPointer = [number, number, number] | null;

const same = (a: QPointer, b: QPointer): boolean =>
  a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

export function createRecorder(opts: { height: number }): Recorder {
  const { height } = opts;
  let pointer: { x: number; y: number; down: boolean } | null = null;
  let pending: string[] = [];
  let prev: QPointer = null; // quantized pointer at the previous step
  // Absolute-step event lists; converted to deltas by log().
  let pEvents: { step: number; q: QPointer }[] = [];
  let kEvents: { step: number; key: string }[] = [];

  const clamp = (v: number, max: number): number => {
    if (!Number.isFinite(v)) return 0;
    return Math.min(max, Math.max(0, v));
  };

  return {
    setPointer(p) {
      pointer = p ? { x: p.x, y: p.y, down: p.down } : null;
    },
    pressKey(key) {
      if (key.length < 1 || key.length > MAX_KEY_LENGTH) return;
      if (pending.length >= MAX_KEYS_PER_STEP) return;
      pending.push(key);
    },
    frame(i) {
      const q: QPointer = pointer
        ? [quantize(clamp(pointer.x, LOGICAL_WIDTH)), quantize(clamp(pointer.y, height)), pointer.down ? 1 : 0]
        : null;
      if (!same(q, prev)) pEvents.push({ step: i, q });
      prev = q;
      const keys = pending;
      pending = [];
      for (const key of keys) kEvents.push({ step: i, key });
      return {
        pointer: q ? { x: q[0] / POINTER_QUANTUM, y: q[1] / POINTER_QUANTUM, down: q[2] === 1 } : null,
        keys: keys.slice(),
      };
    },
    log() {
      const p: number[][] = [];
      let last = 0;
      for (const e of pEvents) {
        p.push(e.q ? [e.step - last, e.q[0], e.q[1], e.q[2]] : [e.step - last]);
        last = e.step;
      }
      const k: [number, string][] = [];
      last = 0;
      for (const e of kEvents) {
        k.push([e.step - last, e.key]);
        last = e.step;
      }
      return { p, k };
    },
    count() {
      return pEvents.length + kEvents.length;
    },
    truncate(i) {
      pEvents = pEvents.filter((e) => e.step < i);
      kEvents = kEvents.filter((e) => e.step < i);
      prev = pEvents.length > 0 ? pEvents[pEvents.length - 1].q : null;
      pending = [];
    },
  };
}
