import { describe, expect, it } from 'vitest';
import type { Generation } from '@/lib/piece/types';
import { resumeOptions } from './resume';

const gen: Generation = { v: 1, s: 'a', p: {} };
const other: Generation = { v: 1, s: 'b', p: {} };

describe('resumeOptions', () => {
  it('starts a fresh build from 0, autoplaying, when there is nothing to resume', () => {
    expect(resumeOptions(null, gen, 'play')).toEqual({ startAt: 0, autoplay: true, finish: false });
  });

  it('starts fresh for a different generation, wherever the old one was', () => {
    const last = { gen: other, index: 50, playing: false, done: false };
    expect(resumeOptions(last, gen, 'play')).toEqual({ startAt: 0, autoplay: true, finish: false });
  });

  it('restores a paused build at the same step, still paused', () => {
    const last = { gen, index: 120, playing: false, done: false };
    expect(resumeOptions(last, gen, 'play')).toEqual({ startAt: 120, autoplay: false, finish: false });
  });

  it('restores a playing build at the same step, still playing', () => {
    const last = { gen, index: 120, playing: true, done: false };
    expect(resumeOptions(last, gen, 'play')).toEqual({ startAt: 120, autoplay: true, finish: false });
  });

  it('redraws a finished build at once', () => {
    const last = { gen, index: 300, playing: false, done: true };
    expect(resumeOptions(last, gen, 'play')).toEqual({ startAt: 0, autoplay: false, finish: true });
  });

  it('finishes at once for instant motion', () => {
    expect(resumeOptions(null, gen, 'instant')).toEqual({ startAt: 0, autoplay: false, finish: true });
  });
});
