import type { PieceDefinition } from '@/lib/piece/types';

/**
 * Aspect for the /c/<id> loading placeholder. The page's static shell streams
 * before the capture record is read, so it can't know the piece; but only
 * interactive pieces can be captured, so when they all share one aspect the
 * placeholder can use it and the loaded view lands in the same box. When they
 * disagree (or there are none) this is undefined and the placeholder shows no
 * art-shaped box rather than a wrong one.
 */
export function captureFallbackAspect(pieces: readonly Pick<PieceDefinition, 'aspect' | 'interactive'>[]): number | undefined {
  const aspects = new Set(pieces.filter((d) => d.interactive).map((d) => d.aspect));
  return aspects.size === 1 ? [...aspects][0] : undefined;
}
