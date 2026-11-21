'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputLog } from '@/lib/input/log';
import type { Motion } from '@/lib/piece/generationState';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import type { Speed } from '@/lib/playback/pacing';
import { createPlayback, type Playback } from '@/lib/playback/playback';
import { resumeOptions, type ResumePoint } from '@/lib/playback/resume';
import { browserStorage, loadSpeed, saveSpeed } from '@/lib/playback/speedPreference';
import { CANVAS_UNAVAILABLE, errorMessage, rafClock, sizeCanvas, useContainerWidth } from './canvasSizing';
import { ArtFrame } from './PieceLayout';
import PlayerBar from './PlayerBar';

/**
 * Canvas at container width × devicePixelRatio with the piece's fixed aspect,
 * animated by one `Playback` per (generation, canvas size). The bitmap is
 * resized only right before drawing, so during a resize the old image is
 * scaled by CSS instead of going blank.
 */
export default function ArtCanvas({
  piece,
  gen,
  motion,
  delayMs,
  input,
  children,
}: {
  piece: PieceDefinition;
  gen: Generation;
  motion: Motion;
  delayMs: number;
  /** Recorded input to replay (a stored capture); keep its identity stable. */
  input?: InputLog;
  /** Extra controls under the player bar. */
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The bitmap is sized from the frame's sizer (stage notices excluded), so a notice only rescales the canvas by CSS. */
  const sizerRef = useRef<HTMLDivElement>(null);
  const cssWidth = useContainerWidth(sizerRef);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  /** Viewer's speed; loaded lazily (browser-only) when the first playback is created. */
  const speedRef = useRef<Speed | null>(null);
  /** Where the last playback was (generation, step, playing, finished), so a resize restores it. */
  const lastRef = useRef<ResumePoint | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cssWidth) return;
    let pb: Playback | null = null;
    const fail = (err: unknown) => {
      pb?.destroy();
      setError(errorMessage(err));
    };
    // A piece that throws mid-build stops the playback and shows the error, like an instant render did.
    const clock = rafClock(fail);
    const timer = setTimeout(() => {
      const sized = sizeCanvas(canvas, cssWidth, piece.aspect);
      if (!sized) {
        setError(CANVAS_UNAVAILABLE);
        return;
      }
      const { ctx, width } = sized;
      speedRef.current ??= loadSpeed(browserStorage(), prefersReducedMotion());
      // A resize redraws the same generation where it was: finished builds at once,
      // others back to the same step, still paused or still playing.
      const resume = resumeOptions(lastRef.current, gen, motion);
      const instant = resume.finish;
      try {
        pb = createPlayback({
          piece,
          gen,
          ctx,
          widthPx: width,
          speed: speedRef.current,
          autoplay: resume.autoplay,
          startAt: resume.startAt,
          clock,
          input,
        });
        if (instant) pb.finish();
        setError(null);
        setPlayback(pb);
      } catch (err) {
        fail(err);
        setPlayback(null);
      }
    }, delayMs);
    return () => {
      clearTimeout(timer);
      if (pb) {
        const { index, playing, done } = pb.status();
        lastRef.current = { gen, index, playing, done };
        pb.destroy();
      }
    };
  }, [piece, gen, motion, cssWidth, delayMs, input]);

  const changeSpeed = useCallback(
    (speed: Speed) => {
      speedRef.current = speed;
      saveSpeed(browserStorage(), speed);
      playback?.setSpeed(speed);
    },
    [playback],
  );

  return (
    // Fits the viewport height (minus the bar row) on wide screens; full width when stacked.
    <ArtFrame aspect={piece.aspect} sizerRef={sizerRef}>
      <div className="relative w-full" style={{ aspectRatio: String(piece.aspect) }}>
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full bg-surface" aria-label={piece.title} role="img" />
        {error && (
          <p role="alert" className="absolute inset-x-0 bottom-0 border-t border-line-strong bg-bg/90 px-3 py-2 text-[13px] text-fg">
            Render failed: {error}
          </p>
        )}
      </div>
      <PlayerBar playback={error ? null : playback} phases={piece.phases} onSpeedChange={changeSpeed} />
      {children}
    </ArtFrame>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
