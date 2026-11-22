import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { defaultsOf } from '@/lib/piece/schema';
import { callLog } from '@/lib/piece/testing/callLog';
import type { Params, PieceDefinition } from '@/lib/piece/types';
import coloniesV1 from '../v1';
import colonies, { createNearestGrid, radialScale } from './index';

interface S { xs: Float64Array; ys: Float64Array; rs: Float64Array; group: Int32Array; colors: string[]; steps: number }
const piece = colonies as unknown as PieceDefinition<S>;
const params = (p: Partial<Params> = {}): Params => ({ ...defaultsOf(piece.schema), ...p });
const build = (p: Partial<Params> = {}, seed = 'splat') => piece.setup(params(p), createRng(seed));

describe('createNearestGrid', () => {
  it('matches a brute-force scan, including ties and points outside the extent', () => {
    const rng = createRng('grid');
    const n = 3000;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // Snap some points to a coarse lattice so exact ties happen.
      xs[i] = i % 5 === 0 ? Math.round(rng.range(-20, 920) / 30) * 30 : rng.range(-20, 920);
      ys[i] = i % 5 === 0 ? Math.round(rng.range(-20, 920) / 30) * 30 : rng.range(-20, 920);
    }
    const grid = createNearestGrid(xs, ys, 900, 12);
    expect(grid.nearest(1, 1).j).toBe(-1);
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const q = { x: rng.range(-30, 930), y: rng.range(-30, 930) };
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < i; j++) {
          const d = (xs[j] - q.x) ** 2 + (ys[j] - q.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        const got = grid.nearest(q.x, q.y);
        expect(got.j).toBe(best);
        expect(got.d).toBeCloseTo(Math.sqrt(bestD), 9);
      }
      grid.add(i);
    }
  });
});

describe('colonies v2', () => {
  it('draws every point exactly once over about 300 steps', () => {
    const s = build({ points: 5000 });
    expect(s.steps).toBeLessThanOrEqual(300);
    const log = callLog();
    for (let i = 0; i < s.steps; i++) piece.step(log.ctx, s, i, { pointer: null, keys: [] });
    expect(log.count('arc')).toBe(5000);
    expect(log.count('stroke')).toBe(5000); // outline on by default
  });

  it('outline off skips the rim strokes', () => {
    const s = build({ points: 2000, outline: false });
    const log = callLog();
    for (let i = 0; i < s.steps; i++) piece.step(log.ctx, s, i, { pointer: null, keys: [] });
    expect(log.count('stroke')).toBe(0);
  });

  it('stronger attraction makes fewer groups', () => {
    const weak = build({ points: 6000, attraction: 5 });
    const strong = build({ points: 6000, attraction: 100 });
    expect(strong.colors.length).toBeLessThan(weak.colors.length);
  });

  it('earlier members of a group are never smaller than later ones', () => {
    const s = build({ points: 6000 });
    const last = new Map<number, number>();
    for (let i = 0; i < s.rs.length; i++) {
      const prev = last.get(s.group[i]);
      if (prev !== undefined) expect(s.rs[i]).toBeLessThan(prev);
      last.set(s.group[i], s.rs[i]);
    }
  });

  it('circle keeps points inside the disc, square inside its margin', () => {
    const disc = build({ points: 4000 });
    const k = 1000 / 900;
    for (let i = 0; i < disc.xs.length; i++) {
      // 350-unit disc plus up to 12 units of jitter per join hop, in source units.
      const r = Math.sqrt((disc.xs[i] / k - 450) ** 2 + (disc.ys[i] / k - 450) ** 2);
      expect(r).toBeLessThan(450);
    }
    const sq = build({ points: 4000, shape: 'square', jitter: 1 });
    const xs = Array.from(sq.xs, (x) => x / k);
    expect(Math.min(...xs)).toBeGreaterThan(60);
    expect(Math.max(...xs)).toBeLessThan(840);
  });

  it('palette mode only uses palette colours', () => {
    const s = build({ points: 3000, colorMode: 'palette', palette: ['#ff0000', '#00ff00'], opacity: 0.5 });
    for (const c of s.colors) expect(['rgba(255, 0, 0, 0.5)', 'rgba(0, 255, 0, 0.5)']).toContain(c);
  });
});

describe('colonies v2 size by distance', () => {
  const v1 = coloniesV1 as unknown as PieceDefinition<S>;
  const v1Build = (p: Partial<Params> = {}, seed = 'splat') => v1.setup({ ...defaultsOf(v1.schema), ...p }, createRng(seed));
  const dist = (s: S, i: number) => Math.sqrt((s.xs[i] - 500) ** 2 + (s.ys[i] - 500) ** 2);

  it('radialScale: 1 in the middle ring, rim x sqrt(8)^s, centre the inverse', () => {
    expect(radialScale(0, 0)).toBe(1);
    expect(radialScale(1, 0.5)).toBe(1);
    expect(radialScale(1, 1)).toBeCloseTo(Math.sqrt(8), 9);
    expect(radialScale(1, 0)).toBeCloseTo(1 / Math.sqrt(8), 9);
    expect(radialScale(-1, 1)).toBeCloseTo(1 / Math.sqrt(8), 9);
  });

  it('at 0 (the default) every point matches v1 exactly', () => {
    for (const shape of ['circle', 'square']) {
      const a = build({ points: 5000, shape });
      const b = v1Build({ points: 5000, shape });
      expect(a.xs).toEqual(b.xs);
      expect(a.ys).toEqual(b.ys);
      expect(a.rs).toEqual(b.rs);
      expect(a.colors).toEqual(b.colors);
    }
  });

  it('only scales sizes: positions, groups and colours are unchanged', () => {
    const a = build({ points: 5000, radialSize: 0.7 });
    const b = v1Build({ points: 5000 });
    expect(a.xs).toEqual(b.xs);
    expect(a.group).toEqual(b.group);
    expect(a.colors).toEqual(b.colors);
  });

  it('positive grows points towards the rim, negative towards the centre', () => {
    const base = v1Build({ points: 5000 });
    for (const sign of [1, -1]) {
      const s = build({ points: 5000, radialSize: sign });
      let inner = 0;
      let outer = 0;
      for (let i = 0; i < s.rs.length; i++) {
        const ratio = s.rs[i] / base.rs[i];
        if (dist(s, i) < 100) inner = Math.max(inner, ratio);
        if (dist(s, i) > 350) outer = Math.max(outer, ratio);
        // Always within the full range.
        expect(ratio).toBeGreaterThanOrEqual(1 / Math.sqrt(8) - 1e-9);
        expect(ratio).toBeLessThanOrEqual(Math.sqrt(8) + 1e-9);
      }
      if (sign > 0) expect(outer).toBeGreaterThan(inner);
      else expect(inner).toBeGreaterThan(outer);
    }
  });
});
