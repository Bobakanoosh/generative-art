'use client';

import { useEffect, useRef, useState } from 'react';
import type { InputLog } from '@/lib/input/log';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { exportStatusMessage, type ExportEvent } from '@/lib/video/deferredProbe';
import { downloadBlob as download } from '@/lib/video/download';
import { exportVideo, videoFileName, type VideoFormat } from '@/lib/video/encode';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { rowClass } from './PieceLayout';
import { useVideoFormat } from './useVideoFormat';

/**
 * "Record video" (MP4, or WebM where H.264 can't be encoded) and "Record GIF" downloads of the build,
 * as panel action rows.
 * `input` replays a stored capture's log; `fileId` (e.g. the capture id) names the file instead of the seed.
 */
export default function VideoExport({
  piece,
  gen,
  slug,
  input,
  fileId,
}: {
  piece: PieceDefinition;
  gen: Generation;
  slug: string;
  input?: InputLog;
  fileId?: string;
}) {
  const { probe, startProbe } = useVideoFormat(piece.aspect);
  const [job, setJob] = useState<{ format: VideoFormat; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<ExportEvent>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the page cancels a running export.
  useEffect(() => () => abortRef.current?.abort(), []);

  const record = async (format: VideoFormat) => {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setJob({ format, progress: 0 });
    setAnnounce({ kind: 'started', format });
    try {
      // exportVideo loads mediabunny/gifenc on demand, keeping them out of the initial bundle.
      const blob = await exportVideo({
        piece,
        gen,
        input,
        format,
        signal: controller.signal,
        onProgress: (progress) => setJob({ format, progress }),
      });
      download(blob, videoFileName(slug, fileId ?? gen.s, format));
      setAnnounce({ kind: 'done', format });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setAnnounce({ kind: 'canceled', format });
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setAnnounce({ kind: 'failed', format });
      }
    } finally {
      abortRef.current = null;
      setJob(null);
    }
  };

  // Start/finish only: a live region around the per-frame progress bar would chatter.
  const status = (
    <p role="status" aria-live="polite" className="sr-only">
      {exportStatusMessage(announce)}
    </p>
  );

  const recordVideo = async () => {
    // Clicked before the idle probe ran (or finished): probe now, then record.
    const format = probe === 'unknown' ? await startProbe() : probe === 'none' ? null : probe;
    if (format) await record(format);
  };

  const videoFormat = probe === 'mp4' || probe === 'webm' ? probe : null;
  const percent = job ? Math.round(job.progress * 100) : 0;
  // `status` stays first in both branches so React keeps the same live-region node.
  return (
    <>
      {status}
      {job ? (
        // One row while encoding: what, a hairline progress track, percent, Cancel.
        <div className="relative flex h-10 items-center gap-3 border-t border-line px-0.5 text-[13px] text-muted">
          <Icon name="video" size={16} />
          <span className="whitespace-nowrap text-fg">Recording {job.format.toUpperCase()}</span>
          <span className="font-mono text-xs tabular-nums">{percent}%</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="absolute inset-x-0 -bottom-px h-px bg-line"
          >
            <div className="h-full bg-fg" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={rowClass}
            disabled={probe === 'none'}
            onClick={recordVideo}
            onPointerEnter={() => void startProbe()}
            onFocus={() => void startProbe()}
            title={probe === 'none' ? 'This browser cannot encode video' : 'Record the build as a 10 s video'}
          >
            <Icon name="video" size={16} />
            Record video{videoFormat ? ` (${videoFormat.toUpperCase()})` : ''}
          </button>
          <button type="button" className={rowClass} onClick={() => record('gif')} title="Record the build as a GIF">
            <Icon name="video" size={16} />
            Record GIF
          </button>
          {error && (
            <p role="alert" className="border-t border-line py-2.5 text-xs leading-relaxed text-fg">
              Export failed: {error}
            </p>
          )}
        </>
      )}
    </>
  );
}
