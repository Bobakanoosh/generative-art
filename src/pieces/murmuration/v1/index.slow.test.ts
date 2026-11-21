import { hrtime } from 'node:process';
import { describe, expect, it } from 'vitest';
import { EMPTY_LOG, type InputLog } from '@/lib/input/log';
import { defaultsOf } from '@/lib/piece/schema';
import type { PieceDefinition } from '@/lib/piece/types';
import {
  DOWNLOAD_WIDTH_FULL,
  DOWNLOAD_WIDTH_MEDIUM,
  DOWNLOAD_WIDTH_SMALL,
  FULL_WIDTH_MAX_STEP,
  MEDIUM_WIDTH_MAX_STEP,
  pngDownloadWidth,
} from '@/lib/render/downloadWidth';
import { renderPng } from '@/lib/render/server';
import murmuration from './index';

/**
 * Slow (tens of seconds of CPU): excluded from `npm test` so it doesn't skew
 * the timing (or starve) the parallel suite; run it with `npm run test:slow`.
 *
 * The download cases check the live-moment PNG widths (downloadWidth.ts) fit
 * the render function's time limit. The veil fade is a full-canvas fill, so
 * render time grows with output width as well as steps.
 */
/** Budget is half the 300 s function limit (maxDuration) to leave room for slower hardware. */
const DOWNLOAD_BUDGET_MS = 150_000;
/** Vitest timeout per download case: above the budget, so a slow render fails on the assertion, with its time. */
const DOWNLOAD_TIMEOUT_MS = 240_000;
const piece = murmuration as PieceDefinition;
const params = { ...defaultsOf(piece.schema), count: 1500 };

/** Wall time of one server render, in ms (performance/Date are lint-banned under src/pieces). */
async function timedRender(n: number, width: number, input: InputLog): Promise<number> {
  const t0 = hrtime.bigint();
  const png = await renderPng(piece, { v: 1, s: 'murmur-test', p: params, n }, width, input);
  const ms = Number(hrtime.bigint() - t0) / 1e6;
  expect(png.length).toBeGreaterThan(0);
  console.log(`murmuration n=${n} w=${width}: ${Math.round(ms)} ms`);
  return ms;
}

describe('murmuration v1 (slow)', () => {
  it(
    'renders 100 000 steps at count 1500 in Node within 60 s (slow)',
    async () => {
      expect(await timedRender(100_000, 100, EMPTY_LOG)).toBeLessThan(60_000);
    },
    120_000,
  );

  it(
    'renders the 100 000-step live-moment download (1200 px) within 150 s (slow)',
    async () => {
      expect(pngDownloadWidth(true, 100_000)).toBe(DOWNLOAD_WIDTH_SMALL);
      expect(await timedRender(100_000, DOWNLOAD_WIDTH_SMALL, EMPTY_LOG)).toBeLessThan(DOWNLOAD_BUDGET_MS);
    },
    DOWNLOAD_TIMEOUT_MS,
  );

  it(
    'renders the longest full-width download (20 000 steps, 4096 px) within 150 s (slow)',
    async () => {
      expect(pngDownloadWidth(true, FULL_WIDTH_MAX_STEP)).toBe(DOWNLOAD_WIDTH_FULL);
      expect(await timedRender(FULL_WIDTH_MAX_STEP, DOWNLOAD_WIDTH_FULL, EMPTY_LOG)).toBeLessThan(DOWNLOAD_BUDGET_MS);
    },
    DOWNLOAD_TIMEOUT_MS,
  );

  it(
    'renders the longest medium-width download (50 000 steps, 2400 px) within 150 s (slow)',
    async () => {
      expect(pngDownloadWidth(true, MEDIUM_WIDTH_MAX_STEP)).toBe(DOWNLOAD_WIDTH_MEDIUM);
      expect(await timedRender(MEDIUM_WIDTH_MAX_STEP, DOWNLOAD_WIDTH_MEDIUM, EMPTY_LOG)).toBeLessThan(DOWNLOAD_BUDGET_MS);
    },
    DOWNLOAD_TIMEOUT_MS,
  );
});
