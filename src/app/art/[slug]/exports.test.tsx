// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LiveHandle } from '@/lib/live/handle';
import type { LiveSim, LiveStatus } from '@/lib/live/live';
import { defaultsOf } from '@/lib/piece/schema';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { getPiece } from '@/pieces';

// The codec probe and the encoder are out of scope (jsdom has neither canvas nor WebCodecs).
const probe = vi.hoisted(() => ({ value: 'mp4' as 'mp4' | 'webm' | 'none' | 'unknown' }));
vi.mock('./useVideoFormat', () => ({
  useVideoFormat: () => ({ probe: probe.value, startProbe: vi.fn(async () => (probe.value === 'none' ? null : 'mp4')) }),
}));

interface ExportCall {
  gen: Generation;
  frames?: number[];
  format: string;
  signal: AbortSignal;
  onProgress(progress: number, phase?: string): void;
}
const exportCalls = vi.hoisted(() => [] as ExportCall[]);
vi.mock('@/lib/video/encode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/video/encode')>()),
  // Never resolves by itself: only an abort settles it (as a real AbortError).
  exportVideo: vi.fn(
    (opts: ExportCall) =>
      new Promise((_, reject) => {
        exportCalls.push(opts);
        opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
  ),
}));
vi.mock('@/lib/video/download', () => ({ downloadBlob: vi.fn() }));

import LiveVideoExport from './LiveVideoExport';
import VideoExport from './VideoExport';

beforeEach(() => {
  probe.value = 'mp4';
  exportCalls.length = 0;
});
afterEach(cleanup);

const murmuration = getPiece('murmuration', 1)!;
const gen: Generation = { v: 1, s: 'abc', p: defaultsOf(murmuration.schema) };

function fakeHandle(initial: Partial<LiveStatus> = {}) {
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
    capture: vi.fn(() => ({ n: status.index, input: { p: [], k: [] } })),
    snapshot: vi.fn((at?: number) => ({ n: Math.min(at ?? status.index, status.index), input: { p: [], k: [] } })),
    destroy: vi.fn(),
  };
  const emit = (patch: Partial<LiveStatus>) => {
    status = { ...status, ...patch };
    subs.forEach((fn) => fn(status));
  };
  const handle: LiveHandle = { sim, gen };
  return { handle, emit };
}

function renderLiveExport(piece: PieceDefinition, handle: LiveHandle) {
  const onRecordingChange = vi.fn();
  render(
    <LiveVideoExport piece={piece} slug="murmuration" live={handle} failed={false} onPlay={vi.fn()} onRecordingChange={onRecordingChange} />,
  );
  return { onRecordingChange };
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Record a clip' }));

describe('LiveVideoExport record menu (interactive piece: records live)', () => {
  it('choosing a length keeps the menu open and checks it', () => {
    const { handle } = fakeHandle();
    renderLiveExport(murmuration, handle);
    openMenu();
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual(['5 s', '10 s', '15 s']);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '15 s' }));
    expect(screen.getByRole('menu')).toBe(menu);
    expect(within(menu).getByRole('menuitemradio', { name: '15 s' }).getAttribute('aria-checked')).toBe('true');
    expect(within(menu).getByRole('menuitemradio', { name: '10 s' }).getAttribute('aria-checked')).toBe('false');
  });

  it('Record GIF starts a recording of the chosen length: Stop takes focus, the bar is told', async () => {
    const { handle } = fakeHandle();
    const { onRecordingChange } = renderLiveExport(murmuration, handle);
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '5 s' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Record GIF' })));
    expect(screen.queryByRole('menu')).toBeNull();
    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(document.activeElement).toBe(stop);
    expect(screen.getByRole('button', { name: 'Cancel recording' })).toBeTruthy();
    expect(onRecordingChange).toHaveBeenLastCalledWith({ elapsed: 0, seconds: 5 });
    expect(exportCalls).toHaveLength(0); // records first, encodes after
  });

  it('keyboard: ArrowDown opens the menu, arrows reach Record MP4, activating it moves focus to Stop', async () => {
    const { handle } = fakeHandle();
    renderLiveExport(murmuration, handle);
    const trigger = screen.getByRole('button', { name: 'Record a clip' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: '10 s' }));
    fireEvent.keyDown(menu, { key: 'End' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    const mp4 = within(menu).getByRole('menuitem', { name: 'Record MP4' });
    expect(document.activeElement).toBe(mp4);
    await act(async () => fireEvent.click(mp4)); // Enter on a <button> clicks it
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop' }));
  });

  it('Stop encodes what was recorded (from the start step to now) with a progress row and Cancel', async () => {
    const { handle, emit } = fakeHandle();
    const { onRecordingChange } = renderLiveExport(murmuration, handle);
    openMenu();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Record GIF' })));
    act(() => emit({ index: 720 })); // 2 s in
    expect(onRecordingChange).toHaveBeenLastCalledWith({ elapsed: 2, seconds: 10 });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop' })));
    expect(handle.sim.snapshot).toHaveBeenCalledWith(720);
    expect(exportCalls).toHaveLength(1);
    expect(exportCalls[0].format).toBe('gif');
    expect(exportCalls[0].frames![0]).toBe(600);
    expect(onRecordingChange).toHaveBeenLastCalledWith(null);
    act(() => exportCalls[0].onProgress(0.4, 'encode'));
    expect(screen.getByRole('progressbar', { name: 'Export progress' }).getAttribute('aria-valuenow')).toBe('40');
    expect(screen.getByText('Encoding GIF')).toBeTruthy();
    // The menu is locked while encoding.
    expect((screen.getByRole('button', { name: 'Record a clip' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(exportCalls[0].signal.aborted).toBe(true);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('GIF recording canceled.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Record a clip' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Cancel recording drops it without encoding and brings the menu back', async () => {
    const { handle, emit } = fakeHandle();
    const { onRecordingChange } = renderLiveExport(murmuration, handle);
    openMenu();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Record GIF' })));
    act(() => emit({ index: 900 }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel recording' }));
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Record a clip' })).toBeTruthy();
    expect(exportCalls).toHaveLength(0);
    expect(onRecordingChange).toHaveBeenLastCalledWith(null);
    // Focus does not fall to the page: it returns to the Record trigger.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Record a clip' }));
  });

  it('a recording that finishes by itself moves focus to the encoding Cancel (the menu is locked while encoding)', async () => {
    const { handle, emit } = fakeHandle();
    renderLiveExport(murmuration, handle);
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '5 s' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Record GIF' })));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop' }));
    await act(async () => emit({ index: 900 })); // 5 s at 60 steps/s: done
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(exportCalls).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    // When the encode ends (here: canceled), focus returns to the Record trigger, not the page.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Record a clip' }));
  });

  it('a recording stopped before a second has passed is canceled with a notice', async () => {
    const { handle } = fakeHandle();
    renderLiveExport(murmuration, handle);
    openMenu();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Record GIF' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop' })));
    expect(exportCalls).toHaveLength(0);
    expect(screen.getByText('Recording canceled: less than a second was recorded.')).toBeTruthy();
  });

  it('has no polite "Recording N seconds" region of its own (the live bar announces recording)', async () => {
    const { handle } = fakeHandle();
    const { container } = render(
      <LiveVideoExport piece={murmuration} slug="murmuration" live={handle} failed={false} onPlay={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record a clip' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Record GIF' })));
    const regions = Array.from(container.querySelectorAll('[aria-live="polite"]'));
    expect(regions.map((r) => r.textContent)).toEqual(['']);
    expect(container.textContent).not.toMatch(/Recording \d+ seconds/);
  });
});

describe('LiveVideoExport (endless, not interactive): encodes straight away', () => {
  it('Record MP4 encodes the chosen length from this moment without recording', async () => {
    const endless = { ...murmuration, interactive: false } as PieceDefinition;
    const { handle } = fakeHandle();
    renderLiveExport(endless, handle);
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '5 s' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Record MP4' })));
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(exportCalls).toHaveLength(1);
    expect(exportCalls[0].format).toBe('mp4');
    expect(exportCalls[0].frames![0]).toBe(600);
  });
});

describe('VideoExport (build) job row', () => {
  const flow = getPiece('flow-ribbons', 1)!;
  const flowGen: Generation = { v: 1, s: 'abc', p: defaultsOf(flow.schema) };

  it('Record GIF shows one row with progress and Cancel; Cancel aborts and restores the buttons', async () => {
    render(<VideoExport piece={flow} gen={flowGen} slug="flow-ribbons" />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record GIF' })));
    expect(exportCalls).toHaveLength(1);
    expect(screen.getByText('Recording GIF')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record GIF' })).toBeNull();
    const bar = screen.getByRole('progressbar', { name: 'Export progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    act(() => exportCalls[0].onProgress(0.25));
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Recording GIF…');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(exportCalls[0].signal.aborted).toBe(true);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Record GIF' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('GIF recording canceled.');
  });

  it('Record video uses the probed format', async () => {
    render(<VideoExport piece={flow} gen={flowGen} slug="flow-ribbons" />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record video (MP4)' })));
    expect(exportCalls[0].format).toBe('mp4');
    expect(screen.getByText('Recording MP4')).toBeTruthy();
  });
});
