import { notFound } from 'next/navigation';
import { getPiece } from '@/pieces';
import { getCachedCapture } from './cached';

/**
 * The stored capture for `id` and its piece version, or the not-found UI
 * (`notFound()` throws). Shared by the /c/<id> page and its print page.
 */
export async function loadCaptureOrNotFound(id: string) {
  const capture = await getCachedCapture(id);
  const piece = capture && getPiece(capture.slug, capture.v);
  if (!capture || !piece) notFound();
  return { capture, piece };
}
