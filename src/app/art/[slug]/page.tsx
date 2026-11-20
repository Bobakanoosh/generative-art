import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { resolvePiece } from '@/lib/piece/generationState';
import { defaultsOf } from '@/lib/piece/schema';
import { decodeGeneration, encodeGeneration, newSeed } from '@/lib/piece/share';
import { MAX_CODE_LENGTH } from '@/lib/render/parseRenderRequest';
import type { PieceDefinition } from '@/lib/piece/types';
import { resolveSiteUrl } from '@/lib/siteUrl';
import { getPiece, listPieces } from '@/pieces';
import ArtView from './ArtView';

const SITE_URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});
const OG_WIDTH = 1200;

/**
 * Cache Components: known slugs make `params` build-time data, so each piece's
 * shell (a placeholder at the piece's aspect) is prerendered. `?g=` is request data, so the
 * interactive view sits behind <Suspense>.
 */
export function generateStaticParams() {
  return listPieces().map((p) => ({ slug: p.slug }));
}

/**
 * The page awaits `params` outside <Suspense> so the static shell can be sized
 * to the piece's aspect (known slugs are build-time data via
 * generateStaticParams). Instant-navigation validation flags that top-level
 * await, so this segment opts out of it. Unknown slugs get their 404 status
 * from src/proxy.ts; the notFound() below is only a fallback (with Cache
 * Components a request-time notFound() streams after a 200 shell).
 */
export const instant = false;

function firstString(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : null;
}

/** A code `/api/render` will accept for the OG image: the link's own if valid, else the first featured one. */
function ogCode(slug: string, code: string | null): string {
  const decoded = code ? decodeGeneration(code) : null;
  const renderable =
    code && decoded && code.length <= MAX_CODE_LENGTH && getPiece(slug, decoded.v);
  if (renderable) return code;
  const latest = getPiece(slug)!;
  return latest.featured[0] ?? encodeGeneration({ v: latest.version, s: 'og', p: defaultsOf(latest.schema) });
}

export async function generateMetadata({ params, searchParams }: PageProps<'/art/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  if (!getPiece(slug)) notFound();
  const code = firstString((await searchParams).g);
  const piece = resolvePiece(slug, code)!;

  const title = piece.title;
  const description = piece.description ?? `${piece.title} — generative art.`;
  const image = {
    url: `/api/render?slug=${encodeURIComponent(slug)}&g=${ogCode(slug, code)}&w=${OG_WIDTH}`,
    width: OG_WIDTH,
    height: Math.round(OG_WIDTH / piece.aspect),
    alt: title,
  };
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    openGraph: { type: 'website', title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function PiecePage({ params, searchParams }: PageProps<'/art/[slug]'>) {
  const { slug } = await params;
  const piece = getPiece(slug);
  if (!piece) notFound();

  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<Placeholder piece={piece} />}>
        <LoadedArtView slug={slug} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoadedArtView({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: PageProps<'/art/[slug]'>['searchParams'];
}) {
  const code = firstString((await searchParams).g);
  // Seed for a bare /art/<slug> visit (or a bad link), chosen on the server so SSR
  // and hydration agree. searchParams alone doesn't exclude this from prerendering
  // (runtime prefetch can resolve it), so opt into request time before the randomness.
  await connection();
  return <ArtView slug={slug} initialCode={code} initialSeed={newSeed()} />;
}

/** Static shell while the request-time view streams in. */
function Placeholder({ piece }: { piece: PieceDefinition }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 lg:p-6">
      <div
        className="max-w-full animate-pulse bg-foreground/5"
        style={{ aspectRatio: String(piece.aspect), width: `min(100%, calc((100dvh - 3rem) * ${piece.aspect}))` }}
        aria-label={`Loading ${piece.title}`}
      />
    </div>
  );
}
