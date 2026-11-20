import { NextResponse, type NextRequest } from 'next/server';
import { getPiece } from '@/pieces';

/**
 * Unknown piece slugs get a real 404 status. With Cache Components the page
 * sends its prerendered shell (status 200) before any request-time check runs,
 * so a notFound() inside the page can only produce a 200 + noindex. This check
 * runs before rendering starts, for the piece page and its print page. The
 * pages keep their own notFound() as a fallback.
 */
export function proxy(request: NextRequest) {
  let slug: string;
  try {
    slug = decodeURIComponent(request.nextUrl.pathname.split('/')[2] ?? '');
  } catch {
    slug = ''; // malformed %-escape: not a piece
  }
  if (getPiece(slug)) return NextResponse.next();
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

export const config = {
  matcher: ['/art/:slug', '/art/:slug/print'],
};
