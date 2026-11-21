import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { newSeed } from '@/lib/piece/share';
import { getPiece, listPieces } from '@/pieces';
import PrintView from './PrintView';

/**
 * Print layout for a piece. Mirrors the piece page under Cache Components:
 * known slugs are build-time params, `?g=` is request data behind <Suspense>.
 * Unknown slugs get their 404 status from src/proxy.ts; notFound() here is a fallback.
 */
export function generateStaticParams() {
  return listPieces().map((p) => ({ slug: p.slug }));
}

/** Top-level await of `params` (outside <Suspense>), as on the piece page. */
export const instant = false;

function firstString(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : null;
}

export async function generateMetadata({ params }: PageProps<'/art/[slug]/print'>): Promise<Metadata> {
  const { slug } = await params;
  const piece = getPiece(slug);
  if (!piece) notFound();
  return { title: `Print · ${piece.title}`, robots: { index: false } };
}

export default async function PrintPage({ params, searchParams }: PageProps<'/art/[slug]/print'>) {
  const { slug } = await params;
  if (!getPiece(slug)) notFound();

  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="px-4 py-6 text-[13px] text-muted sm:px-6">Loading print layout…</p>}>
        <LoadedPrintView slug={slug} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoadedPrintView({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: PageProps<'/art/[slug]/print'>['searchParams'];
}) {
  const code = firstString((await searchParams).g);
  // A bare or invalid link prints the defaults with a seed chosen at request
  // time, so SSR and hydration agree on it.
  await connection();
  return <PrintView slug={slug} initialCode={code} initialSeed={newSeed()} />;
}
