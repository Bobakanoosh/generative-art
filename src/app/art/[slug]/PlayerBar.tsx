'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
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

/**
 * Transport for the build, one 40 px row under the art: play/pause, replay, a
 * seekable 2 px progress track with phase ticks (16 px hit area; the thumb
 * shows on hover, focus and drag), the step count, a speed menu and skip.
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
  const [dragging, setDragging] = useState(false);
  const index = status?.index ?? 0;
  const total = status?.total ?? 0;
  const fraction = total > 0 ? index / total : 0;
  const disabled = !playback || !status;
  const speed = status?.speed ?? 1;

  const seekToPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playback || total <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    playback.seek(stepAtFraction((e.clientX - rect.left) / rect.width, total));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  return (
    <div className="flex h-10 w-full items-center gap-1" aria-label="Build player" role="group">
      <IconButton
        icon={status?.playing ? 'pause' : 'play'}
        label={status?.playing ? 'Pause' : 'Play'}
        disabled={disabled}
        onClick={() => (status?.playing ? playback?.pause() : playback?.play())}
      />
      <IconButton icon="replay" label="Replay" disabled={disabled} onClick={() => playback?.replay()} />

      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Build progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index}
        aria-valuetext={`Step ${index} of ${total}`}
        aria-disabled={disabled}
        data-dragging={dragging || undefined}
        className="group relative mx-2 h-4 min-w-12 flex-1 cursor-pointer touch-none aria-disabled:cursor-default"
        onPointerDown={(e) => {
          if (e.button !== 0 || disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          seekToPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekToPointer(e);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (!playback) return;
          const next = keySeekStep(e.key, index, total);
          if (next === null) return;
          e.preventDefault();
          playback.seek(next);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line-strong">
          <div className="h-full bg-fg" style={{ width: `${fraction * 100}%` }} />
        </div>
        {phaseFractions(phases, total).map((p, i) => (
          <span
            key={i}
            title={p.label}
            data-phase={p.label}
            className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
            style={{ left: `${p.fraction * 100}%` }}
          />
        ))}
        <span
          aria-hidden="true"
          className={
            'pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg opacity-0 ' +
            'transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 ' +
            'group-data-[dragging]:opacity-100 group-aria-disabled:opacity-0'
          }
          style={{ left: `${fraction * 100}%` }}
        />
      </div>

      <span className="min-w-[9ch] text-right font-mono text-xs tabular-nums text-muted" aria-live="off">
        {index} / {total}
      </span>

      <Menu
        label={`Playback speed: ${speedLabel(speed)}`}
        title="Playback speed"
        disabled={disabled}
        triggerClassName="min-w-10 justify-center font-mono text-xs tabular-nums"
        items={SPEEDS.map((s) => ({
          type: 'radio' as const,
          label: speedLabel(s),
          checked: s === speed,
          onSelect: () => onSpeedChange(s),
        }))}
      >
        {speedLabel(speed)}
      </Menu>

      <IconButton icon="skip" label="Skip to end" disabled={disabled || status?.done} onClick={() => playback?.finish()} />
    </div>
  );
}
