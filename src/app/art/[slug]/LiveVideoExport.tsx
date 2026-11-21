'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputLog } from '@/lib/input/log';
import type { LiveHandle } from '@/lib/live/handle';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { exportStatusMessage, type ExportEvent } from '@/lib/video/deferredProbe';
import { downloadBlob } from '@/lib/video/download';
import { exportVideo, videoFileName, type ExportPhase, type VideoFormat } from '@/lib/video/encode';
import {
  DEFAULT_CLIP_SECONDS,
  clipChoices,
  liveClipFileId,
  liveFramePlan,
  parseClipChoice,
  recordingEnd,
  recordingInterruption,
  recordingVerdict,
  stopVerdict,
  type ClipSeconds,
  type RecordingVerdict,
} from '@/lib/video/liveClip';
import { GIF_SPEC, MP4_SPEC, clipFramePlan } from '@/lib/video/plan';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { useLiveStatus, type RecordingState } from './LiveBar';
import { useVideoFormat } from './useVideoFormat';

const fpsOf = (format: VideoFormat) => (format === 'gif' ? GIF_SPEC.fps : MP4_SPEC.fps);

type CancelReason = 'restarted' | 'too-short' | 'changed' | 'failed';

const CANCEL_COPY: Record<CancelReason, string> = {
  restarted: 'Recording canceled: the piece restarted.',
  'too-short': 'Recording canceled: less than a second was recorded.',
  changed: 'Recording canceled: the piece changed.',
  failed: 'Recording canceled: the live view stopped with an error.',
};

/** A real-time recording of an interactive session in progress. */
interface ActiveRecording {
  gen: Generation;
  start: number;
  end: number;
  /** Sim epoch at the start: a Restart (even at step 0) cancels. */
  epoch: number;
  seconds: ClipSeconds;
  format: VideoFormat;
}

/**
 * Video export for a live piece. Endless pieces encode a 5/10/15 s clip from
 * the current moment straight away (offscreen, replaying the input so far,
 * while the live view keeps running). Interactive pieces record the next
 * 5/10/15 s of the live session in real time, then encode it frame-locked from
 * the recorded input. "Loop" (one seamless period) appears when the piece
 * declares `loopSteps`.
 */
export default function LiveVideoExport({
  piece,
  slug,
  live,
  failed,
  onPlay,
  onRecordingChange,
}: {
  piece: PieceDefinition;
  slug: string;
  /** The running sim and its generation; null while there is none. */
  live: LiveHandle | null;
  /** The live view hit an error (no sim will come back by itself): a running recording is canceled. */
  failed: boolean;
  onPlay(): void;
  /** The recording in progress (elapsed and length), or null: the live bar shows it in place of its state. */
  onRecordingChange?(recording: RecordingState | null): void;
}) {
  const status = useLiveStatus(live?.sim ?? null);
  const { probe, startProbe } = useVideoFormat(piece.aspect);
  const [choiceValue, setChoiceValue] = useState(String(DEFAULT_CLIP_SECONDS));
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [job, setJob] = useState<{ format: VideoFormat; progress: number; phase: ExportPhase } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<ExportEvent>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** The recording a verdict may still act on; cleared as soon as one finishes or cancels it. */
  const recordingRef = useRef<ActiveRecording | null>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelJobRef = useRef<HTMLButtonElement>(null);

  const choice = parseClipChoice(choiceValue);
  const recordsLive = piece.interactive === true && choice.kind === 'clip';

  // Keep keyboard focus on this control as it changes shape. Choosing Record unmounts the menu (and
  // its trigger): focus moves to Stop. When a recording or an encode ends, the focused Stop/Cancel
  // unmounts and focus would fall to the page: it moves to what replaced it (the encoding row's
  // Cancel, or the Record trigger), unless it already went somewhere else.
  const phase = recording ? 'recording' : job ? 'encoding' : 'idle';
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === lastPhase.current) return;
    lastPhase.current = phase;
    if (phase === 'recording') {
      stopRef.current?.focus();
      return;
    }
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const trigger = menuTriggerRef.current;
    if (phase === 'encoding') cancelJobRef.current?.focus();
    else if (trigger && !trigger.disabled) trigger.focus();
  }, [phase]);

  // Leaving the page cancels a running export.
  useEffect(() => () => abortRef.current?.abort(), []);

  // The live bar shows "Recording 7s" in place of its state.
  const recordingSeconds = recording?.seconds ?? null;
  useEffect(() => {
    onRecordingChange?.(recordingSeconds === null ? null : { elapsed, seconds: recordingSeconds });
  }, [onRecordingChange, recordingSeconds, elapsed]);
  useEffect(() => () => onRecordingChange?.(null), [onRecordingChange]);

  const encode = useCallback(
    async (gen: Generation, input: InputLog | undefined, frames: number[], format: VideoFormat, fileId: string) => {
      if (abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setJob({ format, progress: 0, phase: 'prepare' });
      setAnnounce({ kind: 'started', format });
      try {
        const blob = await exportVideo({
          piece,
          gen, // exportVideo stops the runners at the plan's last frame
          input,
          frames,
          format,
          signal: controller.signal,
          onProgress: (progress, phase) => setJob({ format, progress, phase }),
        });
        downloadBlob(blob, videoFileName(slug, fileId, format));
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
    },
    [piece, slug],
  );

  /** Acts on a verdict for `rec` once: encodes what was recorded, or drops it with a notice. */
  const settle = useCallback(
    (
      rec: ActiveRecording,
      verdict: RecordingVerdict | { kind: 'cancel'; reason: 'changed' | 'failed' },
      handle: LiveHandle | null,
    ) => {
      if (verdict.kind === 'recording') {
        setElapsed(verdict.elapsed);
        return;
      }
      if (recordingRef.current !== rec) return;
      recordingRef.current = null;
      setRecording(null);
      if (verdict.kind === 'cancel' || !handle) {
        setNotice(CANCEL_COPY[verdict.kind === 'cancel' ? verdict.reason : 'changed']);
        return;
      }
      // The log up to the end step (the sim may already be a few steps past it).
      const moment = handle.sim.snapshot(verdict.at);
      const frames = clipFramePlan(rec.start, rec.seconds, fpsOf(rec.format), moment.n);
      void encode(rec.gen, moment.input, frames, rec.format, liveClipFileId(rec.gen.s, { kind: 'clip', seconds: rec.seconds }, rec.start));
    },
    [encode],
  );

  // While recording, judge every status the sim emits (a resize swaps in a new sim of the same session).
  useEffect(() => {
    if (!recording) return;
    const interrupted = recordingInterruption(recording.gen, live, failed);
    if (interrupted) {
      const id = setTimeout(() => settle(recording, { kind: 'cancel', reason: interrupted }, null));
      return () => clearTimeout(id);
    }
    if (!live) return; // between sims (resize, param debounce): the next one resumes the session
    const check = () => settle(recording, recordingVerdict(recording, live.sim.status()), live);
    const unsubscribe = live.sim.subscribe(check);
    // A sim that is already stopped emits nothing more: judge its current status too.
    const id = setTimeout(check);
    return () => {
      clearTimeout(id);
      unsubscribe();
    };
  }, [recording, live, failed, settle]);

  const start = async (format: VideoFormat) => {
    if (!live || abortRef.current || recordingRef.current) return;
    setError(null);
    setNotice(null);
    if (recordsLive && choice.kind === 'clip') {
      if (!live.sim.status().playing) onPlay();
      const { index: begin, epoch } = live.sim.status();
      const rec: ActiveRecording = {
        gen: live.gen,
        start: begin,
        end: recordingEnd(begin, choice.seconds),
        epoch,
        seconds: choice.seconds,
        format,
      };
      recordingRef.current = rec;
      setElapsed(0);
      setRecording(rec);
      return;
    }
    // Endless clip from now, or a loop: encode straight away without pausing the live view.
    const moment = live.sim.snapshot();
    const frames = liveFramePlan(choice, moment.n, fpsOf(format), piece.loopSteps);
    const input = choice.kind === 'loop' ? undefined : moment.input;
    await encode(live.gen, input, frames, format, liveClipFileId(live.gen.s, choice, moment.n));
  };

  const recordVideo = async () => {
    // Clicked before the idle probe ran (or finished): probe now, then record.
    const format = probe === 'unknown' ? await startProbe() : probe === 'none' ? null : probe;
    if (format) await start(format);
  };

  const stop = () => {
    const rec = recordingRef.current;
    if (!rec || !live) return;
    settle(rec, stopVerdict(rec, live.sim.status().index), live);
  };
  const cancelRecording = () => {
    recordingRef.current = null;
    setRecording(null);
  };

  // Export progress only: the live bar announces recording start and stop.
  const statusRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {exportStatusMessage(announce)}
    </p>
  );

  /** Messages go on muted lines beneath the bar row (the row wraps them to the end). */
  const lineClass = 'order-last basis-full pb-1 text-xs leading-relaxed';
  const messages = (
    <>
      {notice && (
        <p role="status" className={`${lineClass} text-muted`}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className={`${lineClass} text-fg`}>
          Export failed: {error}
        </p>
      )}
    </>
  );

  if (recording) {
    return (
      <>
        {statusRegion}
        <span className="sr-only">of {recording.seconds}s</span>
        <Button ref={stopRef} variant="quiet" size="sm" onClick={stop} title="End now and save what was recorded">
          <Icon name="stop" size={12} />
          Stop
        </Button>
        <IconButton icon="close" label="Cancel recording" onClick={cancelRecording} />
        {messages}
      </>
    );
  }

  const blocked = !status || status.catchingUp || status.limited || status.inputFull;
  // A loop never depends on the current moment; a clip needs a running (or resumable) sim.
  const disabled = !live || !status || (choice.kind === 'clip' && blocked);
  const videoFormat = probe === 'mp4' || probe === 'webm' ? probe : null;
  const what =
    choice.kind === 'loop'
      ? 'one seamless loop'
      : recordsLive
        ? `the next ${choice.seconds} s live, including your input`
        : `${choice.seconds} s from this moment`;
  const percent = job ? Math.round(job.progress * 100) : 0;

  return (
    <>
      {statusRegion}
      <Menu
        label="Record a clip"
        title="Record a video or GIF"
        triggerRef={menuTriggerRef}
        disabled={job !== null}
        onIntent={() => void startProbe()}
        items={[
          { type: 'heading', label: 'Length' },
          ...clipChoices(piece).map((value) => ({
            type: 'radio' as const,
            label: value === 'loop' ? 'Loop' : `${value} s`,
            checked: value === choiceValue,
            keepOpen: true,
            onSelect: () => setChoiceValue(value),
          })),
          { type: 'heading', label: 'Format' },
          {
            type: 'action',
            label: videoFormat ? `Record ${videoFormat.toUpperCase()}` : 'Record video',
            disabled: disabled || probe === 'none',
            title: probe === 'none' ? 'This browser cannot encode video' : `Record ${what} as a video`,
            onSelect: () => void recordVideo(),
          },
          { type: 'action', label: 'Record GIF', disabled, title: `Record ${what} as a GIF`, onSelect: () => void start('gif') },
        ]}
      >
        <Icon name="record" size={14} />
        Record
        <Icon name="chevron-down" size={14} />
      </Menu>
      {job && (
        <div className={`${lineClass} flex items-center gap-3 text-muted`}>
          <span className="whitespace-nowrap">{job.phase === 'prepare' ? 'Preparing…' : `Encoding ${job.format.toUpperCase()}`}</span>
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-0.5 flex-1 bg-line-strong"
          >
            <div className="h-full bg-fg" style={{ width: `${percent}%` }} />
          </div>
          <span className="font-mono tabular-nums">{percent}%</span>
          <Button ref={cancelJobRef} variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        </div>
      )}
      {messages}
    </>
  );
}
