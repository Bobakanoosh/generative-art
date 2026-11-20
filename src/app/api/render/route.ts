import { parseRenderRequest } from '@/lib/render/parseRenderRequest';
import { mapRenderError } from '@/lib/render/renderError';
import { renderPng } from '@/lib/render/server';

// No `runtime` export: with cacheComponents the Node.js runtime is the only
// option and the segment config is unsupported. Reading request.url makes this
// handler request-time (never prerendered).
const NO_STORE = { 'Cache-Control': 'no-store' };

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseRenderRequest(searchParams);
  if (!parsed.ok) return errorResponse(parsed.error, parsed.status);
  try {
    const png = await renderPng(parsed.piece, parsed.gen, parsed.width);
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    const { status, error } = mapRenderError(err);
    return errorResponse(error, status);
  }
}
