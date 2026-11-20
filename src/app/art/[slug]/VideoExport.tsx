'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { exportStatusMessage, onIdle, once, type ExportEvent } from '@/lib/video/deferredProbe';
import {
  browserCodecProbe,
  exportVideo,
  pickVideoFormat,
  videoFileName,
  type VideoFormat,
} from '@/lib/video/encode';

const buttonClass =
  'rounded border border-foreground/20 px-2.5 py-1.5 text-sm hover:bg-foreground/10 active:bg-foreground/20 text-center disabled:opacity-50 disabled:pointer-events-none';

/** 'unknown' until the deferred codec probe resolves; the button stays usable meanwhile. */
type Probe = 'unknown' | 'mp4' | 'webm' | 'none';

/** "Record video" (MP4, or WebM where H.264 can't be encoded) and "GIF" downloads of the build. */
export default function VideoExport({ piece, gen, slug }: { piece: PieceDefinition; gen: Generation; slug: string }) {
  const [probe, setProbe] = useState<Probe>('unknown');
  const [job, setJob] = useState<{ format: VideoFormat; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<ExportEvent>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef(true);

  // The probe imports mediabunny (~760 KB): run it once, when the browser is idle
  // or the viewer hovers/focuses the button, never during the page load.
  const runProbe = useMemo(
    () => once(() => pickVideoFormat(browserCodecProbe(piece.aspect)).catch(() => null)),
    [piece.aspect],
  );
  const startProbe = useCallback(async () => {
    const format = await runProbe();
    if (liveRef.current) setProbe(format ?? 'none');
    return format;
  }, [runProbe]);

  useEffect(() => {
    liveRef.current = true;
    const cancel = onIdle(() => void startProbe(), window);
    return () => {
      liveRef.current = false;
      cancel();
    };
  }, [startProbe]);

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
        format,
        signal: controller.signal,
        onProgress: (progress) => setJob({ format, progress }),
      });
      download(blob, videoFileName(slug, gen.s, format));
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
        <div className="col-span-2 flex items-center gap-2">
          <span className="text-xs whitespace-nowrap opacity-70">Recording {job.format.toUpperCase()}</span>
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 flex-1 overflow-hidden rounded bg-foreground/15"
          >
            <div className="h-full bg-foreground/70" style={{ width: `${percent}%` }} />
          </div>
          <button type="button" className={buttonClass} onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={buttonClass}
            disabled={probe === 'none'}
            onClick={recordVideo}
            onPointerEnter={() => void startProbe()}
            onFocus={() => void startProbe()}
            title={probe === 'none' ? 'This browser cannot encode video' : 'Record the build as a 10 s video'}
          >
            Record video{videoFormat ? ` (${videoFormat.toUpperCase()})` : ''}
          </button>
          <button type="button" className={buttonClass} onClick={() => record('gif')} title="Record the build as a GIF">
            GIF
          </button>
          {error && (
            <p role="alert" className="col-span-2 text-sm text-red-500">
              Export failed: {error}
            </p>
          )}
        </>
      )}
    </>
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
