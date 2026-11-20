import { describe, expect, it, vi } from 'vitest';
import { exportStatusMessage, onIdle, once } from './deferredProbe';

describe('onIdle', () => {
  it('uses requestIdleCallback with a timeout when available, and cancels it', () => {
    const cb = vi.fn();
    const ric = vi.fn<(fn: () => void, opts?: { timeout: number }) => number>(() => 7);
    const cic = vi.fn();
    const st = vi.fn();
    const cancel = onIdle(cb, { requestIdleCallback: ric, cancelIdleCallback: cic, setTimeout: st, clearTimeout: vi.fn() });
    expect(ric).toHaveBeenCalledOnce();
    expect(ric.mock.calls[0][1]).toEqual({ timeout: expect.any(Number) });
    expect(st).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
    ric.mock.calls[0][0]();
    expect(cb).toHaveBeenCalledOnce();
    cancel();
    expect(cic).toHaveBeenCalledWith(7);
  });

  it('falls back to a 1500 ms timeout without requestIdleCallback (Safari), and cancels it', () => {
    const cb = vi.fn();
    const st = vi.fn<(fn: () => void, ms: number) => number>(() => 3);
    const ct = vi.fn();
    const cancel = onIdle(cb, { setTimeout: st, clearTimeout: ct });
    expect(st).toHaveBeenCalledWith(expect.any(Function), 1500);
    st.mock.calls[0][0]();
    expect(cb).toHaveBeenCalledOnce();
    cancel();
    expect(ct).toHaveBeenCalledWith(3);
  });
});

describe('once', () => {
  it('runs the async function at most once and shares its promise', async () => {
    const fn = vi.fn(async () => 'mp4');
    const probe = once(fn);
    const [a, b] = [probe(), probe()];
    expect(await a).toBe('mp4');
    expect(await b).toBe('mp4');
    expect(await probe()).toBe('mp4');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('is lazy: nothing runs until first called', () => {
    const fn = vi.fn(async () => null);
    once(fn);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('exportStatusMessage', () => {
  it('announces only the start and the end of an export', () => {
    expect(exportStatusMessage({ kind: 'started', format: 'mp4' })).toBe('Recording MP4…');
    expect(exportStatusMessage({ kind: 'done', format: 'gif' })).toBe('GIF downloaded.');
    expect(exportStatusMessage({ kind: 'canceled', format: 'webm' })).toBe('WEBM recording canceled.');
    expect(exportStatusMessage({ kind: 'failed', format: 'mp4' })).toBe('MP4 recording failed.');
    expect(exportStatusMessage(null)).toBe('');
  });
});
