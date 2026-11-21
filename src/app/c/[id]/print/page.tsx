import type { Metadata } from 'next';
import { Suspense } from 'react';
import PrintView from '@/app/art/[slug]/print/PrintView';
import { loadCaptureOrNotFound } from '@/lib/capture/load';
import { encodeGeneration } from '@/lib/piece/share';

/**
 * Print layout for a stored capture: the piece print view with the capture's
 * input log replayed in every tile and `c/<id>` as the caption code.
 * Malformed ids get their 404 status from src/proxy.ts.
 */
export async function generateMetadata({ params }: PageProps<'/c/[id]/print'>): Promise<Metadata> {
  const { id } = await params;
  const { piece } = await loadCaptureOrNotFound(id);
  return { title: `Print · ${piece.title}`, robots: { index: false } };
}

export default function CapturePrintPage({ params }: PageProps<'/c/[id]/print'>) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="px-4 py-6 text-[13px] text-muted sm:px-6">Loading print layout…</p>}>
        <LoadedCapturePrint params={params} />
      </Suspense>
    </main>
  );
}

async function LoadedCapturePrint({ params }: { params: PageProps<'/c/[id]/print'>['params'] }) {
  const { id } = await params;
  const { capture } = await loadCaptureOrNotFound(id);
  const { slug, v, s, p, n, i } = capture;
  return (
    <PrintView
      slug={slug}
      initialCode={encodeGeneration({ v, s, p, n })}
      initialSeed={s}
      input={i}
      captionCode={`c/${id}`}
      backHref={`/c/${encodeURIComponent(id)}`}
    />
  );
}
