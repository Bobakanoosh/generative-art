'use client';

import { useMemo } from 'react';
import ArtCanvas from '@/app/art/[slug]/ArtCanvas';
import { ActionRows, CopyLinkRow, PanelHeader, PieceLayout, rowClass } from '@/app/art/[slug]/PieceLayout';
import VideoExport from '@/app/art/[slug]/VideoExport';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { capturePngPath } from '@/lib/capture/metadata';
import type { CaptureRecord } from '@/lib/capture/record';
import { isLive } from '@/lib/live/live';
import type { Generation } from '@/lib/piece/types';
import { pngDownloadWidth } from '@/lib/render/downloadWidth';
import { getPiece } from '@/pieces';

/**
 * A stored capture replayed as a build: the generation runs to its stop step
 * `n` with the recorded input log, so the player ends on the captured image.
 * Same stage/panel layout as the piece page; the panel has actions, no params.
 */
export default function CaptureView({ id, capture }: { id: string; capture: CaptureRecord }) {
  const { slug, v, s, p, n, i: input } = capture;
  // The page only renders this for a known piece version.
  const piece = getPiece(slug, v)!;
  // Stable identities: ArtCanvas restarts its playback when gen or input change.
  const gen = useMemo<Generation>(() => ({ v, s, p, n }), [v, s, p, n]);
  // Long live moments download smaller: the server replays every step to render one.
  const pngWidth = useMemo(() => {
    let live = true; // captures come from live pieces
    try {
      live = isLive(piece, gen);
    } catch {
      // setup threw: keep the live default (the stage shows the error)
    }
    return pngDownloadWidth(live, n);
  }, [piece, gen, n]);

  return (
    <PieceLayout
      panelLabel="Capture"
      stage={<ArtCanvas piece={piece} gen={gen} motion="play" delayMs={0} input={input} />}
      panel={
        <>
          <PanelHeader
            eyebrow="Captured moment"
            title={piece.title}
            description={piece.description}
            meta={
              <>
                v{v} · seed {s} · step {n}
                <br />c/{id}
              </>
            }
          />
          <div className="mt-6">
            {/* Plain <a>: a full load starts the piece page fresh. */}
            <Button variant="primary" href={`/art/${encodeURIComponent(slug)}`} className="w-full" title="Run this piece live from the start">
              <Icon name="play" size={16} />
              Open this piece live
            </Button>
          </div>
          <ActionRows pinned={false}>
            <CopyLinkRow url={() => `${window.location.origin}/c/${encodeURIComponent(id)}`} />
            <a className={rowClass} href={capturePngPath(id, pngWidth)} download={`${slug}-${id}.png`}>
              <Icon name="download" size={16} />
              Download PNG
            </a>
            <VideoExport piece={piece} gen={gen} slug={slug} input={input} fileId={id} />
            <a className={rowClass} href={`/c/${encodeURIComponent(id)}/print`}>
              <Icon name="print" size={16} />
              Print or save as PDF
            </a>
          </ActionRows>
        </>
      }
    />
  );
}
