/**
 * Seeded simplex noise (2D / 3D), after Stefan Gustavson's reference
 * implementation. Arithmetic, Math.sqrt and Math.floor only — deterministic.
 * Outputs are in [-1, 1].
 */
import type { Rng } from './rng';

const GRAD3: readonly (readonly [number, number, number])[] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

const SQRT3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT3 - 1);
const G2 = (3 - SQRT3) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

function buildPerm(rng: Rng): { perm: Uint8Array; permMod12: Uint8Array } {
  const base = rng.shuffle(Array.from({ length: 256 }, (_, i) => i));
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = base[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
}

function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

export function createNoise2D(rng: Rng): (x: number, y: number) => number {
  const { perm, permMod12 } = buildPerm(rng);
  return (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = GRAD3[permMod12[ii + perm[jj]]];
      t0 *= t0;
      n += t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = GRAD3[permMod12[ii + i1 + perm[jj + j1]]];
      t1 *= t1;
      n += t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = GRAD3[permMod12[ii + 1 + perm[jj + 1]]];
      t2 *= t2;
      n += t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return clampUnit(70 * n);
  };
}

export function createNoise3D(rng: Rng): (x: number, y: number, z: number) => number {
  const { perm, permMod12 } = buildPerm(rng);
  return (x, y, z) => {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const g = GRAD3[permMod12[ii + perm[jj + perm[kk]]]];
      t0 *= t0;
      n += t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const g = GRAD3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
      t1 *= t1;
      n += t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const g = GRAD3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]];
      t2 *= t2;
      n += t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const g = GRAD3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
      t3 *= t3;
      n += t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
    }
    return clampUnit(32 * n);
  };
}
