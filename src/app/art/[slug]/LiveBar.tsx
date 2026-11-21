'use client';

import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { INPUT_FULL_NOTICE, LIMIT_NOTICE, LIVE_STEPS_PER_SECOND, type LiveSim, type LiveStatus } from '@/lib/live/live';

/** Latest status per sim, refreshed by its subscribers (useSyncExternalStore needs a stable snapshot). */
const snapshots = new WeakMap<LiveSim, LiveStatus>();

function snapshotOf(sim: LiveSim): LiveStatus {
  let s = snapshots.get(sim);
  if (!s) {
    s = sim.status();
    snapshots.set(sim, s);
  }
  return s;
}

export function useLiveStatus(sim: LiveSim | null): LiveStatus | null {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!sim) return () => {};
      const unsubscribe = sim.subscribe((s) => {
        snapshots.set(sim, s);
        notify();
      });
      // Catch anything emitted before we subscribed.
      snapshots.set(sim, sim.status());
      notify();
      return unsubscribe;
    },
    [sim],
  );
  return useSyncExternalStore(
    subscribe,
    () => (sim ? snapshotOf(sim) : null),
    () => null,
  );
}

/** Elapsed live time at `index` steps, as m:ss. */
export function formatLiveTime(index: number): string {
  const seconds = Math.floor(index / LIVE_STEPS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A recording in progress (LiveVideoExport): shown in place of the live state. */
export interface RecordingState {
  elapsed: number;
  seconds: number;
}

/** A state the live bar announces: the live states plus recording. */
type Announced = 'live' | 'paused' | 'catching up…' | 'recording';

const ANNOUNCEMENT: Record<Announced, string> = {
  live: 'Live',
  paused: 'Paused',
  'catching up…': 'Catching up…',
  recording: 'Recording started',
};

/**
 * The polite announcement for a state change: the state's own words, except
 * leaving a recording reads "Recording stopped". Only transitions change it;
 * the elapsed time and recording seconds never do.
 */
export function liveAnnouncement(previous: Announced | null, next: Announced): string {
  if (previous === 'recording' && next !== 'recording') return 'Recording stopped';
  return ANNOUNCEMENT[next];
}

/**
 * Controls for a live piece, one 40 px row under the art: the state (a 6 px
 * dot, gently pulsing while live, with "Live"/"Paused" and the elapsed time),
 * pause/play, restart, Capture and the record menu (`video`). Limit notices
 * sit on a muted line beneath. While recording the state reads "Recording 7s".
 */
export default function LiveBar({
  sim,
  capturing,
  recording = null,
  onPlay,
  onPause,
  onRestart,
  onCapture,
  video,
}: {
  sim: LiveSim | null;
  /** A capture is being saved or shown: Capture ignores clicks (it stays focusable so focus can return to it). */
  capturing: boolean;
  recording?: RecordingState | null;
  onPlay(): void;
  onPause(): void;
  onRestart(): void;
  onCapture(): void;
  /** Live video export (LiveVideoExport): its control sits at the end of the row, its messages beneath. */
  video?: ReactNode;
}) {
  const status = useLiveStatus(sim);
  const disabled = !sim || !status;
  const blocked = !!status && (status.limited || status.inputFull);
  const state = status?.catchingUp ? 'catching up…' : status?.playing ? 'live' : 'paused';
  const label = recording
    ? `Recording ${recording.elapsed}s`
    : state === 'catching up…'
      ? 'Catching up…'
      : state === 'live'
        ? 'Live'
        : 'Paused';
  const pulsing = recording !== null || state === 'live';
  // Announce transitions only (adjusted during render, React's "previous value" pattern).
  const announced: Announced = recording ? 'recording' : state;
  const [lastAnnounced, setLastAnnounced] = useState<Announced>(announced);
  const [announcement, setAnnouncement] = useState(() => liveAnnouncement(null, announced));
  if (announced !== lastAnnounced) {
    setLastAnnounced(announced);
    setAnnouncement(liveAnnouncement(lastAnnounced, announced));
  }
  const captureOff = capturing || disabled || status.catchingUp || status.index < 1;

  return (
    <div className="flex min-h-10 w-full flex-wrap items-center gap-x-1" aria-label="Live controls" role="group">
      {/* State changes only: the elapsed time and recording seconds tick outside any live region. */}
      <p role="status" aria-live="polite" className="sr-only" data-live-announcement="">
        {announcement}
      </p>
      <span className="mr-1 flex h-10 items-center gap-2 text-[13px] text-fg" data-live-state={state}>
        <span
          aria-hidden="true"
          data-live-dot=""
          className={
            'inline-block size-1.5 shrink-0 rounded-full ' +
            (pulsing ? 'animate-live-pulse bg-fg motion-reduce:animate-none' : state === 'paused' ? 'bg-muted' : 'bg-fg')
          }
        />
        <span data-recording-elapsed={recording?.elapsed}>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted" title={`Step ${status?.index ?? 0}`}>
          {formatLiveTime(status?.index ?? 0)}
        </span>
      </span>
      <IconButton
        icon={status?.playing ? 'pause' : 'play'}
        label={status?.playing ? 'Pause' : 'Play'}
        disabled={disabled || status.catchingUp || (!status.playing && blocked)}
        onClick={() => (status?.playing ? onPause() : onPlay())}
      />
      <IconButton icon="restart" label="Restart" disabled={disabled} onClick={onRestart} />
      <span className="flex-1" />
      <Button
        variant="quiet"
        size="sm"
        // aria-disabled, not disabled, while a capture is open: the dialog returns focus here on close.
        disabled={!capturing && captureOff}
        aria-disabled={capturing ? true : undefined}
        onClick={() => {
          if (!captureOff) onCapture();
        }}
        title="Freeze this moment and get a link to it"
      >
        <Icon name="capture" size={14} />
        Capture
      </Button>
      {video}
      {status?.limited && (
        <p role="status" className="order-last basis-full pb-1 text-xs leading-relaxed text-muted">
          {LIMIT_NOTICE}
        </p>
      )}
      {status?.inputFull && !status.limited && (
        <p role="status" className="order-last basis-full pb-1 text-xs leading-relaxed text-muted">
          {INPUT_FULL_NOTICE}
        </p>
      )}
    </div>
  );
}
