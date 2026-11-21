import { decodeGeneration, MAX_STOP_STEP } from '@/lib/piece/share';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { getPiece } from '@/pieces';
import { fitRenderWidth, MAX_LONG_EDGE, MAX_PIXELS } from './fitWidth';
import { snapWidth } from './widthLadder';

export const DEFAULT_WIDTH = 1200;
export { MAX_LONG_EDGE, MAX_PIXELS, fitRenderWidth };
export const MAX_CODE_LENGTH = 16384;
/** Enforced by decodeGeneration itself; re-exported for callers of this module. */
export { MAX_STOP_STEP };

export type RenderRequest =
  | { ok: true; piece: PieceDefinition; gen: Generation; width: number }
  | { ok: false; status: 400 | 404; error: string };

/** `?w=` -> response width: parsed, defaulted to 1200, snapped up the width ladder, fitted to the aspect. */
export function parseWidth(raw: string | null, aspect: number): number {
  const n = raw === null ? NaN : Number(raw);
  const requested = Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_WIDTH;
  return snapWidth(requested, aspect);
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
