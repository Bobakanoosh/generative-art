'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Motion } from '@/lib/piece/generationState';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { useGeneration } from '@/lib/piece/useGeneration';
import type { Speed } from '@/lib/playback/pacing';
import { createPlayback, type FrameClock, type Playback } from '@/lib/playback/playback';
import { resumeOptions, type ResumePoint } from '@/lib/playback/resume';
import { browserStorage, loadSpeed, saveSpeed } from '@/lib/playback/speedPreference';
import { printHref } from '@/lib/print/paper';
import { fitRenderWidth } from '@/lib/render/parseRenderRequest';
import { latestVersion } from '@/pieces';
import ParamPanel from './ParamPanel';
import PlayerBar from './PlayerBar';
import VideoExport from './VideoExport';

const RESIZE_DEBOUNCE_MS = 150;
const COPIED_MS = 1500;

interface ArtViewProps {
  slug: string;
  initialCode: string | null;
  initialSeed: string;
}

export default function ArtView({ slug, initialCode, initialSeed }: ArtViewProps) {
  const { piece, state, code, renderDelayMs, regenerate, randomize, reset, setParam, dismissIssues } =
    useGeneration(slug, initialCode, initialSeed);
  const latest = latestVersion(slug);
  const isOutdated = latest !== undefined && latest > state.gen.v;

  return (
    <div className="flex flex-1 flex-col lg:flex-row lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
      <section className="flex flex-1 flex-col items-center justify-center gap-3 p-4 lg:p-6 min-w-0">
        {isOutdated && (
          <p role="status" className="w-full max-w-3xl rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            A newer version of this piece exists.{' '}
            {/* Plain <a>: a full load re-initialises the generation from the URL. */}
            <a href={`/art/${slug}`} className="underline">
              View the latest
            </a>
          </p>
        )}
        {state.issues.length > 0 && (
          <div role="alert" className="flex w-full max-w-3xl items-start gap-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            <ul className="flex-1 list-none space-y-0.5">
              {state.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
            <button type="button" onClick={dismissIssues} aria-label="Dismiss notice" className="opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}
        <ArtCanvas piece={piece} gen={state.gen} motion={state.motion} delayMs={renderDelayMs} />
      </section>

      <aside className="w-full shrink-0 border-t border-foreground/10 lg:w-80 lg:border-t-0 lg:border-l lg:overflow-y-auto">
        <div className="space-y-5 p-4">
          <header>
            <h1 className="text-lg font-semibold">{piece.title}</h1>
            {piece.description && <p className="mt-1 text-sm opacity-70">{piece.description}</p>}
            <p className="mt-1 font-mono text-xs opacity-50">
              v{state.gen.v} · seed {state.gen.s}
            </p>
          </header>
          <Actions
            piece={piece}
            gen={state.gen}
            slug={slug}
            code={code}
            seed={state.gen.s}
            onRegenerate={regenerate}
            onRandomize={randomize}
            onReset={reset}
          />
          <ParamPanel schema={piece.schema} params={state.gen.p} onChange={setParam} />
        </div>
      </aside>
    </div>
  );
}

const buttonClass =
  'rounded border border-foreground/20 px-2.5 py-1.5 text-sm hover:bg-foreground/10 active:bg-foreground/20 text-center';

function Actions(props: {
  piece: PieceDefinition;
  gen: Generation;
  slug: string;
  code: string;
  seed: string;
  onRegenerate(): void;
  onRandomize(): void;
  onReset(): void;
}) {
  const { slug, code, seed } = props;
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Built from the code, not location.href: the address bar lags param tweaks by the URL debounce.
  const copyLink = async () => {
    const url = `${window.location.origin}/art/${encodeURIComponent(slug)}?g=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const pngHref = `/api/render?slug=${encodeURIComponent(slug)}&g=${code}&w=4096`;

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={buttonClass} onClick={props.onRegenerate} title="New seed, same settings">
        Regenerate
      </button>
      <button type="button" className={buttonClass} onClick={props.onRandomize} title="New seed and random settings">
        Randomize
      </button>
      <button type="button" className={buttonClass} onClick={props.onReset} title="Default settings, same seed">
        Reset
      </button>
      <button type="button" className={buttonClass} onClick={copyLink} aria-live="polite">
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <a className={`${buttonClass} col-span-2`} href={pngHref} download={`${slug}-${seed}.png`}>
        Download PNG
      </a>
      <VideoExport piece={props.piece} gen={props.gen} slug={slug} />
      <a className={`${buttonClass} col-span-2`} href={printHref(slug, code)}>
        Print / Save as PDF
      </a>
    </div>
  );
}

/**
 * Canvas at container width × devicePixelRatio with the piece's fixed aspect,
 * animated by one `Playback` per (generation, canvas size). The bitmap is
 * resized only right before drawing, so during a resize the old image is
 * scaled by CSS instead of going blank.
 */
function ArtCanvas({
  piece,
  gen,
  motion,
  delayMs,
}: {
  piece: PieceDefinition;
  gen: Generation;
  motion: Motion;
  delayMs: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  /** Viewer's speed; loaded lazily (browser-only) when the first playback is created. */
  const speedRef = useRef<Speed | null>(null);
  /** Where the last playback was (generation, step, playing, finished), so a resize restores it. */
  const lastRef = useRef<ResumePoint | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (first) {
        first = false;
        setCssWidth(width);
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => setCssWidth(width), RESIZE_DEBOUNCE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cssWidth) return;
    let pb: Playback | null = null;
    const fail = (err: unknown) => {
      pb?.destroy();
      setError(err instanceof Error ? err.message : String(err));
    };
    // A piece that throws mid-build stops the playback and shows the error, like an instant render did.
    const clock: FrameClock = {
      now: () => performance.now(),
      request: (cb) =>
        requestAnimationFrame(() => {
          try {
            cb();
          } catch (err) {
            fail(err);
          }
        }),
      cancel: (id) => cancelAnimationFrame(id),
    };
    const timer = setTimeout(() => {
      const dpr = window.devicePixelRatio || 1;
      // Same long-edge and pixel caps as the render API: huge/high-DPR screens
      // (or a very tall piece) never allocate a giant canvas.
      const width = fitRenderWidth(cssWidth * dpr, piece.aspect);
      const height = Math.round(width / piece.aspect);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Canvas 2D is not available in this browser.');
        return;
      }
      canvas.width = width;
      canvas.height = height;
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
  }, [piece, gen, motion, cssWidth, delayMs]);

  const changeSpeed = useCallback(
    (speed: Speed) => {
      speedRef.current = speed;
      saveSpeed(browserStorage(), speed);
      playback?.setSpeed(speed);
    },
    [playback],
  );

  return (
    <div
      className="flex max-w-full flex-col gap-2"
      style={{
        // Fit the viewport height (minus the player bar) on wide screens; full width when stacked.
        width: `min(100%, calc((100dvh - 6rem) * ${piece.aspect}))`,
      }}
    >
      <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: String(piece.aspect) }}>
        <canvas ref={canvasRef} className="block h-full w-full bg-black/20" aria-label={piece.title} role="img" />
        {error && (
          <p role="alert" className="absolute inset-x-0 bottom-0 bg-red-900/80 p-2 text-sm text-white">
            Render failed: {error}
          </p>
        )}
      </div>
      <PlayerBar playback={error ? null : playback} phases={piece.phases} onSpeedChange={changeSpeed} />
    </div>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
