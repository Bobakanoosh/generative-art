import type { Metadata } from 'next';
import { getPiece } from '@/pieces';
import type { CaptureRecord } from './record';

export const CAPTURE_OG_WIDTH = 1200;

/** PNG of a stored capture, as served by /api/render/c/<id>. */
export function capturePngPath(id: string, width: number): string {
  return `/api/render/c/${encodeURIComponent(id)}?w=${width}`;
}

/**
 * Page metadata for /c/<id>: the piece title plus an OG/Twitter image of the
 * captured moment. Null when the capture (or its piece version) is unknown.
 */
export async function captureMetadata(
  id: string,
  load: (id: string) => Promise<CaptureRecord | null>,
  siteUrl: string,
): Promise<Metadata | null> {
  const capture = await load(id);
  const piece = capture && getPiece(capture.slug, capture.v);
  if (!capture || !piece) return null;

  const title = piece.title;
  const description = `A captured moment of ${piece.title} — interactive generative art.`;
  const image = {
    url: capturePngPath(id, CAPTURE_OG_WIDTH),
    width: CAPTURE_OG_WIDTH,
    height: Math.round(CAPTURE_OG_WIDTH / piece.aspect),
    alt: title,
  };
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    openGraph: { type: 'website', title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
