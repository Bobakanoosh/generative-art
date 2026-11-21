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
import murmuration from './index';

const piece = murmuration as PieceDefinition;
const gen = (n: number, p: Record<string, unknown> = {}): Generation => ({
  v: 1,
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

describe('murmuration v1', () => {
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
describe('murmuration v1 input snapshots', () => {
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
