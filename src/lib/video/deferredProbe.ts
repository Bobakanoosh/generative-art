/**
 * Helpers for VideoExport: the codec probe loads mediabunny (~760 KB), so it
 * runs once, when the browser is idle or the viewer reaches for the button,
 * never as part of the page load.
 */
import type { VideoFormat } from './encode';

export const IDLE_FALLBACK_MS = 1500;
/** Longest an idle callback may wait on a busy page (a playing build) before it runs anyway. */
const IDLE_TIMEOUT_MS = 5000;

export interface IdleEnv {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => unknown;
  clearTimeout: (id: never) => void;
}

/** Runs `cb` once the browser is idle (or after 1.5 s where idle callbacks are missing). Returns a cancel. */
export function onIdle(cb: () => void, env: IdleEnv): () => void {
  // Always called as methods of `env`: window's timer functions throw when unbound.
  if (env.requestIdleCallback && env.cancelIdleCallback) {
    const id = env.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });
    return () => env.cancelIdleCallback!(id);
  }
  const id = env.setTimeout(cb, IDLE_FALLBACK_MS);
  return () => env.clearTimeout(id as never);
}

/** `fn` called at most once; every call shares the first call's promise. */
export function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => (promise ??= fn());
}

export type ExportEvent = { kind: 'started' | 'done' | 'canceled' | 'failed'; format: VideoFormat } | null;

/** Screen-reader announcement for an export's start or end (never its per-frame progress). */
export function exportStatusMessage(event: ExportEvent): string {
  if (!event) return '';
  const name = event.format.toUpperCase();
  switch (event.kind) {
    case 'started':
      return `Recording ${name}…`;
    case 'done':
      return `${name} downloaded.`;
    case 'canceled':
      return `${name} recording canceled.`;
    case 'failed':
      return `${name} recording failed.`;
  }
}
