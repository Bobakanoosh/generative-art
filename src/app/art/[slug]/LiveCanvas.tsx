'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveCapture, type CaptureResult } from '@/lib/capture/client';
import { createRecorder, type Recorder } from '@/lib/input/recorder';
import { takeMoment, type LiveHandle } from '@/lib/live/handle';
import { createLiveSim } from '@/lib/live/live';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { LOGICAL_WIDTH } from '@/lib/render/runner';
import CaptureDialog from './CaptureDialog';
import { CANVAS_UNAVAILABLE, errorMessage, rafClock, sizeCanvas, useContainerWidth } from './canvasSizing';
import { ArtFrame } from './PieceLayout';
import LiveBar, { type RecordingState } from './LiveBar';
import LiveVideoExport from './LiveVideoExport';

export const INTERACTIVE_HINT = 'Drag on the art';

/** Keys that move focus or are only modifiers: never delivered to the piece. */
const IGNORED_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape']);

/**
 * One live session per generation: the recorder outlives canvas resizes (a
 * resize resumes at the same step with the same input), while a new
 * generation starts a fresh session from step 0.
 */
interface Session {
  gen: Generation;
  recorder: Recorder;
  /** Step to resume at after a resize. */
  index: number;
  /** Whether the viewer wants it running (not paused by them or by Capture). */
  playing: boolean;
  /** Restarts so far (LiveStatus.epoch), carried across resizes. */
  epoch: number;
}

/**
 * Canvas for endless/interactive pieces: runs the piece in real time,
 * records the viewer's pointer and keys, and captures the moment as a link.
 */
export default function LiveCanvas({
  slug,
  piece,
  gen,
  delayMs,
}: {
  slug: string;
  piece: PieceDefinition;
  gen: Generation;
  delayMs: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The bitmap is sized from the frame's sizer (stage notices excluded), so a notice only rescales the canvas by CSS. */
  const sizerRef = useRef<HTMLDivElement>(null);
  const cssWidth = useContainerWidth(sizerRef);
  const [error, setError] = useState<string | null>(null);
  /** The running sim and the generation it runs; null while none is (e.g. during a param-change debounce). */
  const [live, setLive] = useState<LiveHandle | null>(null);
  const [hint, setHint] = useState(piece.interactive === true);
  /** undefined: no dialog; null: saving; otherwise the result. */
  const [capture, setCapture] = useState<CaptureResult | null | undefined>(undefined);
  /** A live video recording in progress, shown by the bar. */
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const sessionRef = useRef<Session | null>(null);
  /** Same as `live`, readable synchronously from event handlers. */
  const liveRef = useRef<LiveHandle | null>(null);
  /** Bumped per capture and on close: only the latest save may fill the dialog. */
  const captureToken = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cssWidth) return;
    let handle: LiveHandle | null = null;
    let startAt = 0;
    const drop = () => {
      if (!handle) return;
      handle.sim.destroy();
      if (liveRef.current === handle) liveRef.current = null;
      // The bar must not keep driving (or capturing) a destroyed sim.
      setLive((cur) => (cur === handle ? null : cur));
    };
    const fail = (err: unknown) => {
      drop();
      setError(errorMessage(err));
    };
    const clock = rafClock(fail);
    const timer = setTimeout(() => {
      const sized = sizeCanvas(canvas, cssWidth, piece.aspect);
      if (!sized) {
        setError(CANVAS_UNAVAILABLE);
        return;
      }
      let session = sessionRef.current;
      if (!session || session.gen !== gen) {
        session = {
          gen,
          recorder: createRecorder({ height: LOGICAL_WIDTH / piece.aspect }),
          index: 0,
          playing: true,
          epoch: 0,
        };
        sessionRef.current = session;
      }
      startAt = session.index;
      try {
        const sim = createLiveSim({
          piece,
          gen,
          ctx: sized.ctx,
          widthPx: sized.width,
          recorder: session.recorder,
          clock,
          startAt,
          autoplay: session.playing,
          epoch: session.epoch,
        });
        handle = { sim, gen };
        liveRef.current = handle;
        setError(null);
        setLive(handle);
      } catch (err) {
        fail(err);
      }
    }, delayMs);
    return () => {
      clearTimeout(timer);
      if (!handle) return;
      const session = sessionRef.current;
      const st = handle.sim.status();
      // Mid catch-up the sim hasn't reached its resume step yet: keep aiming for it.
      if (session && session.gen === gen) {
        session.index = st.catchingUp ? startAt : st.index;
        session.epoch = st.epoch;
      }
      drop();
    };
  }, [piece, gen, cssWidth, delayMs]);

  const setWanted = (playing: boolean) => {
    if (sessionRef.current) sessionRef.current.playing = playing;
  };
  const play = useCallback(() => {
    setWanted(true);
    liveRef.current?.sim.play();
  }, []);
  const pause = useCallback(() => {
    setWanted(false);
    liveRef.current?.sim.pause();
  }, []);
  const restart = useCallback(() => {
    setWanted(true);
    liveRef.current?.sim.restart();
  }, []);

  const doCapture = useCallback(async () => {
    // Capture the sim the bar showed, with that sim's own generation; refuse a stale one.
    const taken = takeMoment(liveRef.current, live);
    if (!taken) return;
    setWanted(false);
    const token = ++captureToken.current;
    setCapture(null);
    const result = await saveCapture(slug, taken.gen, taken.moment);
    if (captureToken.current === token) setCapture(result);
  }, [live, slug]);

  const closeDialog = useCallback(() => {
    captureToken.current++;
    setCapture(undefined);
  }, []);
  const resume = useCallback(() => {
    closeDialog();
    play();
  }, [closeDialog, play]);

  // --- input ----------------------------------------------------------------
  const recorder = () => sessionRef.current?.recorder ?? null;
  const toLogical = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * (LOGICAL_WIDTH / piece.aspect),
    };
  };
  const pointer = (e: React.PointerEvent<HTMLCanvasElement>, down: boolean) => {
    if (!e.isPrimary) return;
    const at = toLogical(e);
    if (at) recorder()?.setPointer({ ...at, down });
  };

  return (
    <ArtFrame aspect={piece.aspect} sizerRef={sizerRef}>
      <div className="relative w-full" style={{ aspectRatio: String(piece.aspect) }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full touch-none bg-surface"
          style={{ touchAction: 'none' }}
          aria-label={piece.interactive ? `${piece.title} (live, interactive)` : `${piece.title} (live)`}
          role="img"
          tabIndex={0}
          onPointerDown={(e) => {
            if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.focus({ preventScroll: true });
            setHint(false);
            pointer(e, true);
          }}
          onPointerMove={(e) => pointer(e, e.pointerType === 'mouse' ? (e.buttons & 1) === 1 : e.pressure > 0)}
          onPointerUp={(e) => pointer(e, false)}
          onPointerLeave={(e) => {
            if (e.isPrimary) recorder()?.setPointer(null);
          }}
          onPointerCancel={(e) => {
            if (e.isPrimary) recorder()?.setPointer(null);
          }}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || IGNORED_KEYS.has(e.key)) return;
            if (e.key === ' ') e.preventDefault(); // Space belongs to the piece, not page scroll
            if (e.repeat || !liveRef.current?.sim.status().playing) return;
            recorder()?.pressKey(e.key);
          }}
        />
        {hint && !error && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-fg/85 [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
            {INTERACTIVE_HINT}
          </p>
        )}
        {error && (
          <p role="alert" className="absolute inset-x-0 bottom-0 border-t border-line-strong bg-bg/90 px-3 py-2 text-[13px] text-fg">
            Render failed: {error}
          </p>
        )}
      </div>
      <LiveBar
        sim={error ? null : (live?.sim ?? null)}
        capturing={capture !== undefined}
        onPlay={play}
        onPause={pause}
        onRestart={restart}
        onCapture={doCapture}
        recording={recording}
        video={
          <LiveVideoExport
            piece={piece}
            slug={slug}
            live={error ? null : live}
            failed={error !== null}
            onPlay={play}
            onRecordingChange={setRecording}
          />
        }
      />
      {capture !== undefined && <CaptureDialog result={capture} onResume={resume} onClose={closeDialog} />}
    </ArtFrame>
  );
}
