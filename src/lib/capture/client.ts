/**
 * Browser side of Capture: turns a live moment into a shareable link. A moment
 * with no input is just a generation with a stop step, so it becomes a plain
 * `?g=` link without touching the server; anything with input is stored.
 */
import { isEmptyLog, type InputLog } from '@/lib/input/log';
import { encodeGeneration } from '@/lib/piece/share';
import type { Generation } from '@/lib/piece/types';
import { CAPTURE_ID_RE, canonicalCapture } from './record';

export type CaptureResult =
  | { kind: 'link'; url: string }
  | { kind: 'stored'; url: string }
  | { kind: 'error'; message: string };

export const RATE_LIMITED_MESSAGE = 'Too many captures — try again in a few minutes.';
export const UNAVAILABLE_MESSAGE = "Saving captures isn't available here.";
export const SAVE_FAILED_MESSAGE = "Couldn't save the capture.";

/** Relative URL of the moment: `/art/<slug>?g=…` (no input) or `/c/<id>` (stored). */
export async function saveCapture(
  slug: string,
  gen: Generation,
  moment: { n: number; input: InputLog },
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<CaptureResult> {
  if (isEmptyLog(moment.input)) {
    const code = encodeGeneration({ v: gen.v, s: gen.s, p: gen.p, n: moment.n });
    return { kind: 'link', url: `/art/${encodeURIComponent(slug)}?g=${code}` };
  }

  const body = canonicalCapture({ slug, v: gen.v, s: gen.s, p: gen.p, n: moment.n, i: moment.input });
  let res: Response;
  try {
    res = await fetcher('/api/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    return { kind: 'error', message: SAVE_FAILED_MESSAGE };
  }
  if (res.status === 429) return { kind: 'error', message: RATE_LIMITED_MESSAGE };
  if (res.status === 503) return { kind: 'error', message: UNAVAILABLE_MESSAGE };
  if (!res.ok) return { kind: 'error', message: SAVE_FAILED_MESSAGE };
  try {
    const json: unknown = await res.json();
    const id = (json as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && CAPTURE_ID_RE.test(id)) return { kind: 'stored', url: `/c/${id}` };
  } catch {
    // fall through
  }
  return { kind: 'error', message: SAVE_FAILED_MESSAGE };
}
