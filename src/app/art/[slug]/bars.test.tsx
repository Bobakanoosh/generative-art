// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LiveSim, LiveStatus } from '@/lib/live/live';
import { LIMIT_NOTICE } from '@/lib/live/live';
import type { Playback, PlaybackStatus } from '@/lib/playback/playback';
import LiveBar from './LiveBar';
import PlayerBar from './PlayerBar';

afterEach(cleanup);

function fakePlayback(initial: Partial<PlaybackStatus> = {}) {
  let status: PlaybackStatus = { index: 40, total: 320, playing: false, done: false, speed: 1, ...initial };
  const subs = new Set<(s: PlaybackStatus) => void>();
  const emit = (patch: Partial<PlaybackStatus>) => {
    status = { ...status, ...patch };
    subs.forEach((fn) => fn(status));
  };
  const pb: Playback = {
    play: vi.fn(() => emit({ playing: true })),
    pause: vi.fn(() => emit({ playing: false })),
    replay: vi.fn(),
    seek: vi.fn(),
    finish: vi.fn(),
    setSpeed: vi.fn(),
    status: () => status,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    destroy: vi.fn(),
  };
  return { pb, emit };
}

describe('PlayerBar', () => {
  const phases = [{ at: 160, label: 'Second pass' }];

  it('is one row: play, replay, progress slider, step count, speed menu, skip', () => {
    const { pb } = fakePlayback();
    render(<PlayerBar playback={pb} phases={phases} onSpeedChange={() => {}} />);
    const bar = screen.getByRole('group', { name: 'Build player' });
    expect(bar.className).toContain('h-10');
    const names = Array.from(bar.querySelectorAll('button, [role="slider"]')).map(
      (el) => el.getAttribute('aria-label') ?? el.textContent,
    );
    expect(names).toEqual(['Play', 'Replay', 'Build progress', 'Playback speed: 1×', 'Skip to end']);
    expect(within(bar).getByText('40 / 320').className).toContain('font-mono');
  });

  it('play/pause toggles and the label follows the playback', () => {
    const { pb } = fakePlayback();
    render(<PlayerBar playback={pb} phases={undefined} onSpeedChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(pb.play).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pb.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(pb.replay).toHaveBeenCalled();
  });

  it('the progress slider reports the step and seeks with the keyboard', () => {
    const { pb } = fakePlayback();
    render(<PlayerBar playback={pb} phases={phases} onSpeedChange={() => {}} />);
    const slider = screen.getByRole('slider', { name: 'Build progress' });
    expect(slider.getAttribute('aria-valuenow')).toBe('40');
    expect(slider.getAttribute('aria-valuemax')).toBe('320');
    expect(slider.getAttribute('aria-valuetext')).toBe('Step 40 of 320');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(pb.seek).toHaveBeenCalledWith(320);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(pb.seek).toHaveBeenCalledWith(0);
  });

  it('draws phase ticks at their fraction of the build', () => {
    const { pb } = fakePlayback();
    const { container } = render(<PlayerBar playback={pb} phases={phases} onSpeedChange={() => {}} />);
    const tick = container.querySelector<HTMLElement>('[data-phase="Second pass"]')!;
    expect(tick.style.left).toBe('50%');
    expect(tick.className).toContain('w-px');
  });

  it('speed is a compact menu of 0.5×, 1×, 2×, Instant', () => {
    const { pb } = fakePlayback();
    const onSpeedChange = vi.fn();
    render(<PlayerBar playback={pb} phases={undefined} onSpeedChange={onSpeedChange} />);
    const trigger = screen.getByRole('button', { name: 'Playback speed: 1×' });
    expect(trigger.textContent).toBe('1×');
    fireEvent.click(trigger);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual(['0.5×', '1×', '2×', 'Instant']);
    expect(items[1].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: '2×' }));
    expect(onSpeedChange).toHaveBeenCalledWith(2);
  });

  it('skip finishes the build and is disabled once done; everything is disabled without a playback', () => {
    const { pb, emit } = fakePlayback();
    render(<PlayerBar playback={pb} phases={undefined} onSpeedChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to end' }));
    expect(pb.finish).toHaveBeenCalled();
    act(() => emit({ done: true, index: 320 }));
    expect((screen.getByRole('button', { name: 'Skip to end' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<PlayerBar playback={null} phases={undefined} onSpeedChange={() => {}} />);
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('slider').getAttribute('aria-disabled')).toBe('true');
  });
});

function fakeSim(initial: Partial<LiveStatus> = {}) {
  let status: LiveStatus = { index: 600, playing: true, limited: false, catchingUp: false, inputFull: false, epoch: 0, ...initial };
  const subs = new Set<(s: LiveStatus) => void>();
  const sim: LiveSim = {
    play: vi.fn(),
    pause: vi.fn(),
    restart: vi.fn(),
    status: () => status,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    capture: vi.fn(() => ({ n: status.index, input: { v: 1, events: [] } as never })),
    snapshot: vi.fn(() => ({ n: status.index, input: { v: 1, events: [] } as never })),
    destroy: vi.fn(),
  };
  const emit = (patch: Partial<LiveStatus>) => {
    status = { ...status, ...patch };
    subs.forEach((fn) => fn(status));
  };
  return { sim, emit };
}

function renderLive(sim: LiveSim | null, extra: Partial<React.ComponentProps<typeof LiveBar>> = {}) {
  const handlers = { onPlay: vi.fn(), onPause: vi.fn(), onRestart: vi.fn(), onCapture: vi.fn() };
  render(<LiveBar sim={sim} capturing={false} {...handlers} {...extra} />);
  return handlers;
}

describe('LiveBar', () => {
  it('shows a pulsing dot, "Live" and the elapsed time while running; static dot and "Paused" when paused', () => {
    const { sim, emit } = fakeSim();
    const { container } = render(
      <LiveBar sim={sim} capturing={false} onPlay={() => {}} onPause={() => {}} onRestart={() => {}} onCapture={() => {}} />,
    );
    const state = container.querySelector<HTMLElement>('[data-live-state]')!;
    expect(within(state).getByText('Live')).toBeTruthy();
    expect(within(state).getByText('0:10').className).toContain('font-mono');
    const dot = container.querySelector<HTMLElement>('[data-live-dot]')!;
    expect(dot.className).toContain('animate-live-pulse');
    expect(dot.className).toContain('motion-reduce:animate-none');
    act(() => emit({ playing: false }));
    expect(within(state).getByText('Paused')).toBeTruthy();
    expect(dot.className).not.toContain('animate-live-pulse');
  });

  it('pause/play, restart and Capture call their handlers', () => {
    const { sim, emit } = fakeSim();
    const h = renderLive(sim);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(h.onPause).toHaveBeenCalled();
    act(() => emit({ playing: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(h.onPlay).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(h.onRestart).toHaveBeenCalled();
    const capture = screen.getByRole('button', { name: 'Capture' });
    expect(capture.querySelector('[data-icon="capture"]')).toBeTruthy();
    fireEvent.click(capture);
    expect(h.onCapture).toHaveBeenCalledTimes(1);
  });

  it('Capture stays focusable but inert while a capture is open (focus can return to it)', () => {
    const { sim } = fakeSim();
    const h = renderLive(sim, { capturing: true });
    const capture = screen.getByRole('button', { name: 'Capture' }) as HTMLButtonElement;
    expect(capture.disabled).toBe(false);
    expect(capture.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(capture);
    expect(h.onCapture).not.toHaveBeenCalled();
  });

  it('shows the recording state: "Recording 7s" in place of the live label', () => {
    const { sim } = fakeSim();
    renderLive(sim, { recording: { elapsed: 7, seconds: 10 } });
    const bar = screen.getByRole('group', { name: 'Live controls' });
    expect(within(bar).getByText('Recording 7s')).toBeTruthy();
    expect(within(bar).queryByText('Live')).toBeNull();
  });

  it('announces state transitions only: the polite region ignores ticks of the clock and the recording seconds', () => {
    const { sim, emit } = fakeSim();
    const handlers = { onPlay: vi.fn(), onPause: vi.fn(), onRestart: vi.fn(), onCapture: vi.fn() };
    const { container, rerender } = render(<LiveBar sim={sim} capturing={false} {...handlers} />);
    const region = container.querySelector<HTMLElement>('[data-live-announcement]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Live');
    // The elapsed timer is not inside any live region.
    const timer = within(container.querySelector<HTMLElement>('[data-live-state]')!).getByText('0:10');
    expect(timer.closest('[aria-live]')).toBeNull();
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    act(() => emit({ index: 660 })); // a tick
    expect(timer.textContent).toBe('0:11');
    expect(region.textContent).toBe('Live');

    act(() => emit({ playing: false }));
    expect(region.textContent).toBe('Paused');
    act(() => emit({ playing: true }));
    expect(region.textContent).toBe('Live');

    rerender(<LiveBar sim={sim} capturing={false} recording={{ elapsed: 0, seconds: 10 }} {...handlers} />);
    expect(region.textContent).toBe('Recording started');
    rerender(<LiveBar sim={sim} capturing={false} recording={{ elapsed: 1, seconds: 10 }} {...handlers} />);
    act(() => emit({ index: 720 }));
    expect(screen.getByText('Recording 1s')).toBeTruthy();
    expect(region.textContent).toBe('Recording started');

    rerender(<LiveBar sim={sim} capturing={false} recording={null} {...handlers} />);
    expect(region.textContent).toBe('Recording stopped');
    act(() => emit({ index: 780 }));
    expect(region.textContent).toBe('Recording stopped');
    act(() => emit({ playing: false }));
    expect(region.textContent).toBe('Paused');
  });

  it('puts the limit notice on a muted line beneath the row', () => {
    const { sim } = fakeSim({ limited: true, playing: false });
    renderLive(sim);
    const notice = screen.getByText(LIMIT_NOTICE);
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.className).toContain('text-muted');
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
