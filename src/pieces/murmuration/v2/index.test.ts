import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { EMPTY_LOG, type InputLog } from '@/lib/input/log';
import { defaultsOf, validateParams } from '@/lib/piece/schema';
import { decodeGeneration } from '@/lib/piece/share';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { renderPng } from '@/lib/render/server';
import { createCanvas } from '@napi-rs/canvas';
import { callLog } from '@/lib/piece/testing/callLog';
import { replaySource } from '@/lib/input/log';
import { renderGeneration } from '@/lib/render/runner';
import murmuration, { cleanPlan, cleansFully, fadeSteps } from './index';

const piece = murmuration as PieceDefinition;
const gen = (n: number, p: Record<string, unknown> = {}): Generation => ({
  v: 2,
  s: 'murmur-test',
  p: { ...defaultsOf(piece.schema), ...p },
  n,
});

// Pointer goes down at step 20 near the centre, drags right over 60 steps, lifts.
const drag: InputLog = {
  p: [
    [20, 5000, 5000, 1],
    ...Array.from({ length: 6 }, (_, k) => [10, 5000 + 300 * (k + 1), 5000, 1]),
    [10, 6800, 5000, 0],
    [5],
  ],
  k: [],
};
const space: InputLog = { p: [], k: [[40, ' ']] };

describe('murmuration v2', () => {
  it('is endless, interactive and accumulating', () => {
    const state = piece.setup(defaultsOf(piece.schema), createRng('x'));
    expect(piece.steps(state)).toBe(Infinity);
    expect(piece.interactive).toBe(true);
    expect(piece.accumulates).toBe(true);
    expect(piece.aspect).toBe(1);
    expect(piece.loopSteps).toBeUndefined();
  });

  it('same seed and same input log render identical bytes', async () => {
    const a = await renderPng(piece, gen(150), 200, drag);
    const b = await renderPng(piece, gen(150), 200, drag);
    expect(a.equals(b)).toBe(true);
  });

  it('a pointer-down drag changes the image', async () => {
    const plain = await renderPng(piece, gen(150), 200, EMPTY_LOG);
    const dragged = await renderPng(piece, gen(150), 200, drag);
    expect(dragged.equals(plain)).toBe(false);
  });

  it('repel mode differs from attract under the same drag', async () => {
    const attract = await renderPng(piece, gen(150), 200, drag);
    const repel = await renderPng(piece, gen(150, { mode: 'repel' }), 200, drag);
    expect(repel.equals(attract)).toBe(false);
  });

  it('a pointer that is not down does not change the image', async () => {
    const hover: InputLog = { p: [[20, 5000, 5000, 0], [30, 6000, 5000, 0]], k: [] };
    const plain = await renderPng(piece, gen(150), 200, EMPTY_LOG);
    const hovered = await renderPng(piece, gen(150), 200, hover);
    expect(hovered.equals(plain)).toBe(true);
  });

  it('pressing Space changes the image', async () => {
    const plain = await renderPng(piece, gen(150), 200, EMPTY_LOG);
    const scattered = await renderPng(piece, gen(150), 200, space);
    expect(scattered.equals(plain)).toBe(false);
  });


  it('trail fade is at least 0.06, and every featured/snapshot code is still valid', () => {
    const trail = piece.schema.trail;
    expect(trail.kind === 'number' && trail.min).toBe(0.06);
    for (const code of [...piece.featured, ...(piece.snapshotCodes ?? [])]) {
      const g = decodeGeneration(code)!;
      expect(g.p.trail as number).toBeGreaterThanOrEqual(0.06);
      expect(validateParams(piece.schema, g.p).issues).toEqual([]);
    }
  });
});

/**
 * Input-driven output pinned by hash (tests/snapshots.test.ts only covers
 * input-free codes): attract drag, repel drag and Space at 400 px.
 * Record with UPDATE_SNAPSHOTS=1.
 */
describe('murmuration v2 input snapshots', () => {
  const file = path.join(__dirname, 'inputSnapshots.json');
  const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
  // Drag, then Space at step 90 while the pointer is still held off-centre (680, 500).
  const dragAndSpace: InputLog = { p: drag.p.slice(0, -2), k: [[90, ' ']] };
  const cases: Record<string, { gen: Generation; input: InputLog }> = {
    'attract-drag': { gen: gen(300), input: drag },
    'repel-drag': { gen: gen(300, { mode: 'repel' }), input: drag },
    space: { gen: gen(300), input: space },
    'drag-then-space-at-pointer': { gen: gen(300, { count: 900 }), input: dragAndSpace },
  };

  it('match recorded hashes', async () => {
    const hashes: Record<string, string> = {};
    for (const [name, c] of Object.entries(cases)) hashes[name] = sha256(await renderPng(piece, c.gen, 400, c.input));
    if (process.env.UPDATE_SNAPSHOTS === '1') {
      fs.writeFileSync(file, JSON.stringify(hashes, null, 2) + '\n');
      return;
    }
    expect(fs.existsSync(file), `missing ${file}; run with UPDATE_SNAPSHOTS=1`).toBe(true);
    expect(hashes).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
  }, 60_000);
});

describe('murmuration v2 smooth fade', () => {
  const dusk = ['#f4d6b8', '#e9967a', '#c0627e', '#6c5a9c', '#f6f1ea'];

  it('veils every step at the trail alpha (no bursts) and cleans every 4th step', () => {
    const state = piece.setup(gen(0).p, createRng('fade'));
    const log = callLog();
    const fills: number[] = [];
    for (let i = 0; i < 12; i++) {
      const before = log.count('fillRect');
      piece.step(log.ctx, state, i, { pointer: null, keys: [] });
      fills.push(log.count('fillRect') - before);
    }
    // Step 0 also paints the background; clean-up steps add two exact fills.
    expect(fills).toEqual([2, 1, 1, 3, 1, 1, 1, 3, 1, 1, 1, 3]);
  });

  it('cleanPlan: channels above the background step down, below step up, mixed are left alone', () => {
    expect(cleanPlan(dusk, '#0b0b10')).toEqual([
      { op: 'lighten', color: 'rgb(12, 12, 17)' },
      { op: 'difference', color: 'rgb(1, 1, 1)' },
    ]);
    expect(cleanPlan(['#101010', '#202020'], '#f0f0f0')).toEqual([
      { op: 'darken', color: 'rgb(239, 239, 239)' },
      { op: 'lighter', color: 'rgb(1, 1, 1)' },
    ]);
    // Red above, green below, blue mixed.
    expect(cleanPlan(['#ff0010', '#c000f0'], '#808080')).toEqual([
      { op: 'lighten', color: 'rgb(129, 0, 0)' },
      { op: 'difference', color: 'rgb(1, 0, 0)' },
      { op: 'darken', color: 'rgb(255, 127, 255)' },
      { op: 'lighter', color: 'rgb(0, 1, 0)' },
    ]);
    expect(cleanPlan(['#808080'], '#808080')).toEqual([]);
  });

  function fadeTo(palette: string[], background: string, trail: number, clean: boolean, steps: number) {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 8, 8);
    palette.forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.fillRect(k, 0, 1, 8);
    });
    const veil = `rgba(${[1, 3, 5].map((o) => parseInt(background.slice(o, o + 2), 16)).join(', ')}, ${trail})`;
    const plan = cleanPlan(palette, background);
    for (let i = 0; i < steps; i++) {
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, 8, 8);
      if (clean && i % 4 === 3) {
        for (const { op, color } of plan) {
          ctx.globalCompositeOperation = op;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 8, 8);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // Raw RGBA of the first row (getImageData is lint-banned under src/pieces).
    return [...canvas.data().subarray(0, 8 * 4)];
  }
  const solid = (hex: string) =>
    Array.from({ length: 8 }, () => [...[1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)), 255]).flat();

  it('a faint per-step veil alone stalls as a haze above the background', () => {
    const px = fadeTo(dusk, '#0b0b10', 0.06, false, 600);
    expect(px.slice(0, 4)).not.toEqual(px.slice(28, 32));
  });

  // Trail pixels end identical to untouched background pixels (column 7). The
  // veil's own rounding can settle the whole canvas a level off the exact
  // background colour (napi-rs: 240 -> 239 on light grey), which is invisible.
  function expectNoHaze(px: number[], background: string) {
    const bg = solid(background).slice(0, 4);
    const ref = px.slice(28, 32);
    expect(px).toEqual(Array.from({ length: 8 }, () => ref).flat());
    for (let c = 0; c < 3; c++) expect(Math.abs(ref[c] - bg[c])).toBeLessThanOrEqual(1);
  }

  it('with the clean-up, old trails reach the background (dark and light backgrounds)', () => {
    expectNoHaze(fadeTo(dusk, '#0b0b10', 0.06, true, 600), '#0b0b10');
    expectNoHaze(fadeTo(dusk, '#000000', 0.06, true, 600), '#000000');
    expectNoHaze(fadeTo(['#101010', '#203040'], '#f0f0f0', 0.06, true, 600), '#f0f0f0');
    expectNoHaze(fadeTo(dusk, '#0b0b10', 0.3, true, 600), '#0b0b10');
  });
});

describe('murmuration v2 fast-forward (single-image renders)', () => {
  /** A full render: every step drawn, no shortcut. */
  async function fullPng(g: Generation, width: number, input?: InputLog, tile?: { x: number; y: number; w: number; h: number }) {
    const height = tile ? Math.round((width * tile.h) / tile.w) : width;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    renderGeneration(piece, g, ctx, width, tile, input ? replaySource(input) : undefined);
    return canvas.encode('png');
  }

  it('keeps a few hundred steps at most, and none when a channel cannot be cleaned', () => {
    expect(fadeSteps(0.06)).toBeLessThan(500);
    expect(fadeSteps(0.3)).toBeLessThan(fadeSteps(0.06));
    const keep = piece.fastForward!.keep;
    expect(keep(gen(0).p)).toBe(fadeSteps(0.08));
    expect(cleansFully(['#ff0010', '#c000f0'], '#808080')).toBe(false);
    expect(keep({ ...gen(0).p, palette: ['#ff0010', '#c000f0', '#ff0010', '#c000f0', '#ff0010'], background: '#808080' })).toBeUndefined();
  });

  const cases: [string, Generation, InputLog | undefined][] = [
    ['defaults', gen(1500), undefined],
    ['longest trails', gen(1500, { trail: 0.06, count: 1500 }), undefined],
    ['short trails', gen(1200, { trail: 0.3 }), undefined],
    ['black background', gen(1500, { trail: 0.06, background: '#000000' }), undefined],
    ['light background, dark birds', gen(1500, { trail: 0.06, background: '#f0ece4', palette: ['#1b1b2f', '#3a2e5c', '#5c3a4e', '#2e4a5c', '#101010'] }), undefined],
    ['drag and Space', gen(1500, { trail: 0.06 }), { p: [[1300, 5000, 5000, 1], [60, 6500, 4000, 1], [10, 6500, 4000, 0], [5]], k: [[1420, ' ']] }],
    ['shorter than the kept steps', gen(120), undefined],
  ];

  it.each(cases)('is byte-identical to a full render: %s', async (_name, g, input) => {
    const fast = await renderPng(piece, g, 240, input);
    expect(fast.equals(await fullPng(g, 240, input))).toBe(true);
  }, 60_000);

  it('is byte-identical for every featured code', async () => {
    for (const code of piece.featured) {
      const g = decodeGeneration(code)!;
      expect((await renderPng(piece, g, 160)).equals(await fullPng(g, 160))).toBe(true);
    }
  }, 120_000);

  it('is byte-identical for a print tile (offset region)', async () => {
    const { renderPrintTile } = await import('@/lib/print/renderTile');
    const g = gen(1500, { trail: 0.06 });
    const tile = { x: 250, y: 400, w: 500, h: 300 };
    const fast = createCanvas(300, 180);
    renderPrintTile(piece, g, fast.getContext('2d') as unknown as CanvasRenderingContext2D, { px: { w: 300, h: 180 }, logical: tile } as never);
    const full = createCanvas(300, 180);
    const fctx = full.getContext('2d') as unknown as CanvasRenderingContext2D;
    renderGeneration(piece, g, fctx, 300, tile);
    const { flattenOnPaper } = await import('@/lib/print/tiles');
    flattenOnPaper(fctx);
    expect((await fast.encode('png')).equals(await full.encode('png'))).toBe(true);
  }, 60_000);
});
