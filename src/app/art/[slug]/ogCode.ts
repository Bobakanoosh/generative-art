import { isLive } from '@/lib/live/live';
import { defaultsOf } from '@/lib/piece/schema';
import { decodeGeneration, encodeGeneration } from '@/lib/piece/share';
import type { PieceDefinition } from '@/lib/piece/types';
import { MAX_CODE_LENGTH } from '@/lib/render/parseRenderRequest';
import { getPiece } from '@/pieces';

/** Whether a decoded generation runs live with no stop step (an endless render of it has no end). */
function liveWithoutStop(piece: PieceDefinition, gen: NonNullable<ReturnType<typeof decodeGeneration>>): boolean {
  if (gen.n) return false; // n = 0 counts as no stop step, as on the page
  try {
    return isLive(piece, gen);
  } catch {
    return false; // setup threw: let the render route report it
  }
}

/**
 * A code `/api/render` will accept for the OG image: the link's own if it is
 * valid and renderable, else the piece's first featured one. A live link
 * without a stop step (`?g=` of a running endless/interactive piece, as Copy
 * link gives) has no image of its own, so it previews the first featured code.
 */
export function ogCode(
  slug: string,
  code: string | null,
  lookup: (slug: string, version?: number) => PieceDefinition | undefined = getPiece,
): string {
  const decoded = code ? decodeGeneration(code) : null;
  const piece = code && decoded && code.length <= MAX_CODE_LENGTH ? lookup(slug, decoded.v) : undefined;
  if (code && decoded && piece && !liveWithoutStop(piece, decoded)) return code;
  const latest = lookup(slug)!;
  return latest.featured[0] ?? encodeGeneration({ v: latest.version, s: 'og', p: defaultsOf(latest.schema) });
}
