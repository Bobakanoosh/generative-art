import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getCachedCapture } from '@/lib/capture/cached';
import { loadCaptureOrNotFound } from '@/lib/capture/load';
import { captureMetadata } from '@/lib/capture/metadata';
import { resolveSiteUrl } from '@/lib/siteUrl';
import { allVersions } from '@/pieces';
import { PieceLayout, StagePlaceholder } from '@/app/art/[slug]/PieceLayout';
import CaptureView from './CaptureView';
import { captureFallbackAspect } from './fallbackAspect';

const SITE_URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});

/**
 * A stored capture: an interactive session's moment (generation + stop step n)
 * and its input log, replayed as a build. Ids are runtime params (no
 * generateStaticParams), so the view sits behind <Suspense> and the storage
 * read is cached ('use cache', captures are immutable). Malformed ids get a
 * 404 status from src/proxy.ts; a well-formed unknown id renders the
 * not-found UI after the 200 shell (Cache Components streams it).
 */
export async function generateMetadata({ params }: PageProps<'/c/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const meta = await captureMetadata(id, getCachedCapture, SITE_URL);
  if (!meta) notFound();
  return meta;
}

export default function CapturePage({ params }: PageProps<'/c/[id]'>) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<Placeholder />}>
        <LoadedCaptureView params={params} />
      </Suspense>
    </main>
  );
}

async function LoadedCaptureView({ params }: { params: PageProps<'/c/[id]'>['params'] }) {
  const { id } = await params;
  const { capture } = await loadCaptureOrNotFound(id);
  return <CaptureView id={id} capture={capture} />;
}

/**
 * Static shell while the capture loads: the piece page layout. The piece isn't
 * known until the record is read, so the art box uses the aspect all capturable
 * pieces share (`captureFallbackAspect`); if they differ, no box is guessed.
 */
function Placeholder() {
  const aspect = captureFallbackAspect(allVersions());
  return (
    <PieceLayout
      panelLabel="Capture"
      stage={
        aspect === undefined ? (
          <p role="status" aria-busy="true" className="text-[13px] text-muted">
            Loading capture…
          </p>
        ) : (
          <StagePlaceholder aspect={aspect} label="Loading capture" />
        )
      }
      panel={<p className="ui-label">Captured moment</p>}
    />
  );
}
