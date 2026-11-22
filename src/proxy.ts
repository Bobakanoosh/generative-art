import { NextResponse, type NextRequest } from 'next/server';
import { CAPTURE_ID_RE } from '@/lib/capture/record';
import { getPiece, renamedSlug } from '@/pieces';

/**
 * Unknown piece slugs and malformed capture ids get a real 404 status. With
 * Cache Components the page sends its prerendered shell (status 200) before
 * any request-time check runs, so a notFound() inside the page can only
 * produce a 200 + noindex. This check runs before rendering starts, for the
 * piece and capture pages and their print pages. The pages keep their own
 * notFound() as a fallback (a well-formed but unknown capture id still gets
 * the not-found UI with a 200: existence needs a storage read).
 */
export function proxy(request: NextRequest) {
  const [, section, rawKey] = request.nextUrl.pathname.split('/');
  let key: string;
  try {
    key = decodeURIComponent(rawKey ?? '');
  } catch {
    key = ''; // malformed %-escape: not a piece or capture
  }
  // A renamed piece: permanent redirect to its current slug, keeping the rest of the path and the query.
  const renamed = section === 'art' ? renamedSlug(key) : undefined;
  if (renamed) {
    const url = request.nextUrl.clone();
    const parts = url.pathname.split('/');
    parts[2] = renamed;
    url.pathname = parts.join('/');
    return NextResponse.redirect(url, 308);
  }
  const known = section === 'c' ? CAPTURE_ID_RE.test(key) : Boolean(getPiece(key));
  if (known) return NextResponse.next();
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

export const config = {
  matcher: ['/art/:slug', '/art/:slug/print', '/c/:id', '/c/:id/print'],
};
