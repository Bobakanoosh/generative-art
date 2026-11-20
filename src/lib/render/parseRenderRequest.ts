import { decodeGeneration, MAX_STOP_STEP } from '@/lib/piece/share';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { getPiece } from '@/pieces';

export const DEFAULT_WIDTH = 1200;
export const MIN_WIDTH = 16;
/** DoS caps: bound the work a single public request can demand. */
export const MAX_LONG_EDGE = 4096;
export const MAX_PIXELS = 16_777_216; // 4096 * 4096
export const MAX_CODE_LENGTH = 16384;
/** Enforced by decodeGeneration itself; re-exported for callers of this module. */
export { MAX_STOP_STEP };

const fits = (w: number, aspect: number) => {
  const h = Math.round(w / aspect);
  return h <= MAX_LONG_EDGE && w * h <= MAX_PIXELS;
};

/**
 * The largest output width <= `width` whose canvas (height = round(w / aspect))
 * has neither edge over MAX_LONG_EDGE nor more than MAX_PIXELS pixels. Shared
 * by the render API and the browser canvas so neither can be made to allocate
 * an unbounded bitmap.
 */
export function fitRenderWidth(width: number, aspect: number): number {
  let w = Math.min(
    Math.round(width),
    MAX_LONG_EDGE,
    Math.floor((MAX_LONG_EDGE + 0.5) * aspect),
    Math.floor(Math.sqrt(MAX_PIXELS * aspect)) + 1,
  );
  while (w > 1 && !fits(w, aspect)) w--;
  return Math.max(1, w);
}

export type RenderRequest =
  | { ok: true; piece: PieceDefinition; gen: Generation; width: number }
  | { ok: false; status: 400 | 404; error: string };

function parseWidth(raw: string | null, aspect: number): number {
  const n = raw === null ? NaN : Number(raw);
  const requested = Number.isFinite(n) && n > 0 ? Math.max(MIN_WIDTH, Math.round(n)) : DEFAULT_WIDTH;
  return fitRenderWidth(requested, aspect);
}

export function parseRenderRequest(params: URLSearchParams): RenderRequest {
  const slug = params.get('slug');
  if (!slug) return { ok: false, status: 400, error: 'Missing slug' };

  const code = params.get('g');
  if (!code) return { ok: false, status: 400, error: 'Missing share code' };
  if (code.length > MAX_CODE_LENGTH) {
    return { ok: false, status: 400, error: 'Share code too long' };
  }

  if (!getPiece(slug)) return { ok: false, status: 404, error: 'Unknown piece' };

  const gen = decodeGeneration(code);
  // Also rejects n > MAX_STOP_STEP.
  if (!gen) return { ok: false, status: 400, error: 'Invalid share code' };

  const piece = getPiece(slug, gen.v);
  if (!piece) return { ok: false, status: 404, error: 'Unknown piece version' };

  return { ok: true, piece, gen, width: parseWidth(params.get('w'), piece.aspect) };
}
