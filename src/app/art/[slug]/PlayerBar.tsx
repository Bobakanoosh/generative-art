'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { SPEEDS, phaseFractions, type Speed } from '@/lib/playback/pacing';
import type { Playback, PlaybackStatus } from '@/lib/playback/playback';
import { keySeekStep, stepAtFraction } from '@/lib/playback/seek';

/** Latest status per playback, refreshed by its subscribers (useSyncExternalStore needs a stable snapshot). */
const snapshots = new WeakMap<Playback, PlaybackStatus>();

function snapshotOf(playback: Playback): PlaybackStatus {
  let s = snapshots.get(playback);
  if (!s) {
    s = playback.status();
    snapshots.set(playback, s);
  }
  return s;
}

function usePlaybackStatus(playback: Playback | null): PlaybackStatus | null {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!playback) return () => {};
      const unsubscribe = playback.subscribe((s) => {
        snapshots.set(playback, s);
        notify();
      });
      // Catch anything emitted before we subscribed.
      snapshots.set(playback, playback.status());
      notify();
      return unsubscribe;
    },
    [playback],
  );
  return useSyncExternalStore(
    subscribe,
    () => (playback ? snapshotOf(playback) : null),
    () => null,
  );
}

const speedLabel = (s: Speed) => (s === 'instant' ? 'Instant' : `${s}×`);

const buttonClass =
  'rounded border border-foreground/20 px-2 py-1 text-xs hover:bg-foreground/10 active:bg-foreground/20 disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * Transport controls for the live build: play/pause, replay, a seekable
 * progress track with phase ticks, speed, skip to end and a step counter.
 */
export default function PlayerBar({
  playback,
  phases,
  onSpeedChange,
}: {
  playback: Playback | null;
  phases: { at: number; label: string }[] | undefined;
  onSpeedChange(speed: Speed): void;
}) {
  const status = usePlaybackStatus(playback);
  const index = status?.index ?? 0;
  const total = status?.total ?? 0;
  const fraction = total > 0 ? index / total : 0;
  const disabled = !playback || !status;

  const seekToPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playback || total <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    playback.seek(stepAtFraction((e.clientX - rect.left) / rect.width, total));
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 text-xs" aria-label="Build player" role="group">
      <button
        type="button"
        className={`${buttonClass} w-14`}
        disabled={disabled}
        onClick={() => (status?.playing ? playback?.pause() : playback?.play())}
      >
        {status?.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" className={buttonClass} disabled={disabled} onClick={() => playback?.replay()}>
        Replay
      </button>

      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Build progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index}
        aria-valuetext={`Step ${index} of ${total}`}
        aria-disabled={disabled}
        className="relative h-5 min-w-24 flex-1 cursor-pointer touch-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground/60"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekToPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekToPointer(e);
        }}
        onKeyDown={(e) => {
          if (!playback) return;
          const next = keySeekStep(e.key, index, total);
          if (next === null) return;
          e.preventDefault();
          playback.seek(next);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-foreground/15">
          <div className="h-full bg-foreground/70" style={{ width: `${fraction * 100}%` }} />
        </div>
        {phaseFractions(phases, total).map((p, i) => (
          <span
            key={i}
            title={p.label}
            data-phase={p.label}
            className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 bg-foreground/50"
            style={{ left: `${p.fraction * 100}%` }}
          />
        ))}
      </div>

      <span className="w-24 text-right font-mono tabular-nums opacity-70" aria-live="off">
        {index} / {total}
      </span>

      <label className="flex items-center gap-1">
        <span className="opacity-70">Speed</span>
        <select
          className="rounded border border-foreground/20 bg-background px-1 py-0.5"
          value={String(status?.speed ?? 1)}
          disabled={disabled}
          onChange={(e) => {
            const next = SPEEDS.find((s) => String(s) === e.target.value);
            if (next !== undefined) onSpeedChange(next);
          }}
        >
          {SPEEDS.map((s) => (
            <option key={String(s)} value={String(s)}>
              {speedLabel(s)}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className={buttonClass}
        disabled={disabled || status?.done}
        onClick={() => playback?.finish()}
        title="Draw the rest of the build at once"
      >
        Skip to end
      </button>
    </div>
  );
}
