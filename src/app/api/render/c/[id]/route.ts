import { CAPTURE_ID_RE } from '@/lib/capture/record';
import { loadCapture } from '@/lib/capture/store';
import { parseWidth } from '@/lib/render/parseRenderRequest';
import { cachedCaptureRender } from '@/lib/capture/renderCache';
import { mapRenderError } from '@/lib/render/renderError';
import { renderPng } from '@/lib/render/server';
import { getPiece } from '@/pieces';

/**
 * Long live renders replay every step (murmuration at 100 000 steps: about 1.5 min). 300 s is
 * Vercel's fluid-compute limit on all plans; Vercel reads this from the build output.
 */
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'no-store' };

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CAPTURE_ID_RE.test(id)) return errorResponse('Unknown capture', 404);
  let capture: Awaited<ReturnType<typeof loadCapture>>;
  try {
    capture = await loadCapture(id);
  } catch {
    return errorResponse('Could not load capture', 503); // storage outage: not a 404, never cached
  }
  const piece = capture && getPiece(capture.slug, capture.v);
  if (!capture || !piece) return errorResponse('Unknown capture', 404);

  const width = parseWidth(new URL(request.url).searchParams.get('w'), piece.aspect);
  try {
    const png = await cachedCaptureRender(id, width, () =>
      renderPng(piece, { v: capture.v, s: capture.s, p: capture.p, n: capture.n }, width, capture.i),
    );
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch (err) {
    const { status, error } = mapRenderError(err);
    return errorResponse(error, status);
  }
}
