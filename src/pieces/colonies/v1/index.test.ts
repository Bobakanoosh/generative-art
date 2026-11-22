import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { defaultsOf } from '@/lib/piece/schema';
import { callLog } from '@/lib/piece/testing/callLog';
import type { Params, PieceDefinition } from '@/lib/piece/types';
import colonies, { createNearestGrid } from './index';

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

describe('colonies v1', () => {
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
