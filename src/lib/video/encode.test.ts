import { describe, expect, it, vi } from 'vitest';
import { pickVideoFormat, videoFileName, VIDEO_MIME } from './encode';

const supports = (codecs: string[]) => vi.fn(async (codec: 'avc' | 'vp9') => codecs.includes(codec));

describe('pickVideoFormat', () => {
  it('prefers MP4 when H.264 can be encoded', async () => {
    expect(await pickVideoFormat(supports(['avc', 'vp9']))).toBe('mp4');
    expect(await pickVideoFormat(supports(['avc']))).toBe('mp4');
  });

  it('falls back to WebM when only VP9 can be encoded', async () => {
    expect(await pickVideoFormat(supports(['vp9']))).toBe('webm');
  });

  it('returns null when neither codec can be encoded', async () => {
    expect(await pickVideoFormat(supports([]))).toBeNull();
  });

  it('treats a failing capability check as unsupported', async () => {
    const canEncode = vi.fn(async (codec: 'avc' | 'vp9') => {
      if (codec === 'avc') throw new Error('no WebCodecs');
      return true;
    });
    expect(await pickVideoFormat(canEncode)).toBe('webm');
  });
});

describe('videoFileName', () => {
  it('names downloads by slug, seed and extension', () => {
    expect(videoFileName('flow-ribbons', 'abc123', 'mp4')).toBe('flow-ribbons-abc123.mp4');
    expect(videoFileName('flow-ribbons', 'abc123', 'gif')).toBe('flow-ribbons-abc123.gif');
  });
});

describe('VIDEO_MIME', () => {
  it('maps each format to its MIME type', () => {
    expect(VIDEO_MIME).toEqual({ mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif' });
  });
});
