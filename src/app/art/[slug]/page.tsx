import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { resolvePiece } from '@/lib/piece/generationState';
import { newSeed } from '@/lib/piece/share';
import type { PieceDefinition } from '@/lib/piece/types';
import { resolveSiteUrl } from '@/lib/siteUrl';
import { getPiece, listPieces } from '@/pieces';
import ArtView from './ArtView';
import { PanelHeader, PieceLayout, StagePlaceholder } from './PieceLayout';
import { ogCode } from './ogCode';

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

/**
 * Static shell while the request-time view streams in: the loaded view's layout
 * with the art frame at the same size (`artFrameWidth`), so nothing shifts.
 */
function Placeholder({ piece }: { piece: PieceDefinition }) {
  return (
    <PieceLayout
      stage={<StagePlaceholder aspect={piece.aspect} label={`Loading ${piece.title}`} />}
      panel={<PanelHeader title={piece.title} description={piece.description} />}
    />
  );
}
