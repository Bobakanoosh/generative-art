import { defaultsOf } from '@/lib/piece/schema';
import { getPiece } from '@/pieces';
import type { CaptureRecord } from './record';

/** A valid murmuration capture for tests. */
export function goodCapture(): CaptureRecord {
  const piece = getPiece('murmuration', 1)!;
  return {
    slug: 'murmuration', v: 1, s: 'abc', p: defaultsOf(piece.schema), n: 300,
    i: { p: [[5, 5000, 5000, 1], [10, 5100, 5000, 1]], k: [[20, ' ']] },
  };
}
