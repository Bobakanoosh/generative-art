import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedCapture: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('./cached', () => ({ getCachedCapture: mocks.getCachedCapture }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

import { goodCapture } from './fixtures';
import { loadCaptureOrNotFound } from './load';

describe('loadCaptureOrNotFound', () => {
  beforeEach(() => {
    mocks.getCachedCapture.mockReset();
    mocks.notFound.mockClear();
  });

  it('returns the capture and its piece', async () => {
    const capture = goodCapture();
    mocks.getCachedCapture.mockResolvedValue(capture);
    const r = await loadCaptureOrNotFound('aaaaaaaaaaaa');
    expect(r.capture).toBe(capture);
    expect(r.piece.slug).toBe(capture.slug);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('calls notFound for a missing capture', async () => {
    mocks.getCachedCapture.mockResolvedValue(null);
    await expect(loadCaptureOrNotFound('aaaaaaaaaaaa')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound when the piece version is unknown', async () => {
    mocks.getCachedCapture.mockResolvedValue({ ...goodCapture(), v: 999 });
    await expect(loadCaptureOrNotFound('aaaaaaaaaaaa')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
