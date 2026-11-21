import { parseRenderRequest } from '@/lib/render/parseRenderRequest';
import { mapRenderError } from '@/lib/render/renderError';
import { renderPng } from '@/lib/render/server';

// No `runtime` export: under cacheComponents the `runtime` segment config is
// unsupported (Node.js is the only runtime). Other segment config such as
// `maxDuration` below is still supported. Reading request.url makes this
// handler request-time (never prerendered).
/**
 * Long live renders replay every step (murmuration at 100 000 steps: about 1.5 min). 300 s is
 * Vercel's fluid-compute limit on all plans; Vercel reads this from the build output.
 */
export const maxDuration = 300;

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
