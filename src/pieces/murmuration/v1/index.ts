/**
 * murmuration v1 — an endless flock of light. A few flocks roam a slowly
 * turning curl-noise wind (3D noise, z = time); each bird steers into the
 * wind, keeps pace with its flock, is drawn back towards the flock's heart
 * and pushed out of crowded spots (a density-gradient pressure), so the
 * clouds stretch, fold and breathe without collapsing or dispersing. Each
 * flock chases a slowly wandering goal near the middle of the sky.
 * A translucent veil of the background is laid over the canvas (every step,
 * or every few steps at the equivalent alpha for very long trails), so motion
 * leaves fading trails. Hold the pointer down to gather birds into a vortex
 * (or push them away in repel mode); press Space to scatter them.
 *
 * FROZEN once deployed: changing behaviour here changes every share code.
 */
import { createNoise3D } from '@/lib/art/noise';
import type { Rng } from '@/lib/art/rng';
import { rgba } from '@/lib/art/color';
import { log, pow } from '@/lib/art/math';
import type { InputFrame, ParamSchema, Params, PieceDefinition } from '@/lib/piece/types';

const ASPECT = 1;
const W = 1000;
const H = W / ASPECT;
const TIME_RATE = 0.0016; // noise z per step: the wind turns over every few seconds
const DETAIL = 2.3; // frequency of the second wind octave, x the first
const CELL = 25; // grid spacing for the wind and density fields, logical units
const GX = W / CELL; // grid cells across
const GY = H / CELL;
const FIELD_EVERY = 2; // steps between wind-grid refreshes (the wind changes slowly)
const STEER = 0.06; // how quickly a bird turns into the wind
const ALIGN = 0.01; // how quickly a bird matches its flock's velocity
const COHESION = 0.0003; // spring towards the flock centre, per logical unit, x speed
const PRESSURE = 0.02; // push down the crowd-density gradient, x speed
const ROAM = 0.0012; // spring pulling each flock towards its wandering goal, x speed
const ROAM_REACH = 0.3; // how far goals wander from the centre, x canvas size
const ROAM_RATE = 0.5; // goal drift speed relative to the wind
const MARGIN = 90; // soft wall distance from each edge
const WALL = 0.004; // wall spring, per logical unit past the margin
const MAX_SPEED_MUL = 7; // speed cap, as a multiple of the cruise speed
const PULL = 0.5; // pointer force at its centre, x speed
const SWIRL = 0.9; // tangential share of the attract force
const SCATTER = 9; // Space impulse, x speed
const LINE_WIDTH = 2;
const STROKE_ALPHA = 0.85;
const DRAW_STRIDE = 4; // steps between trail segments for one bird...
const MAX_SEGMENT = 10; // ...unless it has flown further than this since the last one
// A veil fainter than this loses colour to 8-bit premultiplied rounding
// (old trails stall a few levels off the background, as a tinted haze), so
// faint trails are veiled every few steps with the equivalent stronger alpha.
const VEIL_MIN = 0.25;

const PALETTES: string[][] = [
  ['#f4d6b8', '#e9967a', '#c0627e', '#6c5a9c', '#f6f1ea'], // dusk
  ['#eaf4f4', '#a9d6e5', '#61a5c2', '#2c7da0', '#cdb4db'], // winter sky
  ['#ffe3a3', '#ffb35c', '#f0763f', '#b8405e', '#fff4e0'], // ember
];

const schema: ParamSchema = {
  count: {
    kind: 'integer', default: 600, min: 100, max: 1500,
    label: 'Birds', description: 'Number of particles in the flocks.', group: 'Flock',
  },
  speed: {
    kind: 'number', default: 1.6, min: 0.5, max: 4, step: 0.05,
    label: 'Speed', description: 'Cruising speed, in logical units per step.', group: 'Flock',
  },
  noiseScale: {
    kind: 'number', default: 1.8, min: 0.5, max: 5, step: 0.05,
    label: 'Noise scale', description: 'Frequency of the wind; higher means tighter turns.', group: 'Flock',
  },
  trail: {
    kind: 'number', default: 0.08, min: 0.06, max: 0.3, step: 0.01,
    label: 'Trail fade',
    // Below 0.25 the fade is laid every few steps at the same overall rate (an implementation detail, not visitor copy).
    description: 'How quickly trails fade; lower leaves longer trails.',
    group: 'Style',
  },
  radius: {
    kind: 'integer', default: 160, min: 40, max: 400,
    label: 'Reach', description: 'How far the pointer pulls (or pushes) while held down.', group: 'Interaction',
  },
  mode: {
    kind: 'select', default: 'attract', options: ['attract', 'repel'],
    label: 'Pointer', description: 'Whether a held pointer gathers or pushes the birds.', group: 'Interaction',
  },
  palette: {
    kind: 'palette', default: PALETTES[0], minColors: 5, maxColors: 5, presets: PALETTES,
    label: 'Palette', group: 'Color',
  },
  background: { kind: 'color', default: '#0b0b10', label: 'Background', group: 'Color' },
};

interface State {
  n: number;
  xs: Float64Array;
  ys: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  cruise: Float64Array; // per-bird speed multiplier
  flock: Uint8Array; // flock index per bird
  flocks: number;
  // per-flock centre and mean velocity, recomputed every step
  fx: Float64Array;
  fy: Float64Array;
  fvx: Float64Array;
  fvy: Float64Array;
  fn: Float64Array;
  gx: Float64Array; // per-flock wandering goal
  gy: Float64Array;
  // wind (curl of the noise potential) and crowd density on grid nodes
  pot: Float64Array; // (GX + 3) x (GY + 3): nodes -1 .. G + 1
  windX: Float64Array; // (GX + 1) x (GY + 1)
  windY: Float64Array;
  rho: Float64Array;
  rhoX: Float64Array; // density gradient
  rhoY: Float64Array;
  lx: Float64Array; // where each bird's trail was last drawn to
  ly: Float64Array;
  groups: number[][]; // bird indices per colour
  strokes: string[]; // stroke colour per group
  wind: (x: number, y: number, z: number) => number;
  detail: (x: number, y: number, z: number) => number;
  freq: number;
  speed: number;
  radius: number;
  repel: boolean;
  background: string;
  veil: string;
  veilEvery: number;
}

function setup(params: Params, rng: Rng): State {
  const n = params.count as number;
  const palette = params.palette as string[];
  const background = params.background as string;
  const trail = params.trail as number;
  const wind = createNoise3D(rng);
  const detail = createNoise3D(rng);

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const cruise = new Float64Array(n);
  const flock = new Uint8Array(n);
  const groups: number[][] = palette.map(() => []);

  const flocks = 1 + rng.int(0, 3);
  const centres: [number, number, number][] = [];
  for (let f = 0; f < flocks; f++) {
    centres.push([rng.range(250, W - 250), rng.range(250, H - 250), rng.range(60, 120)]);
  }
  for (let k = 0; k < n; k++) {
    const f = k % flocks;
    const [cx, cy, spread] = centres[f];
    flock[k] = f;
    xs[k] = cx + rng.gaussian(0, spread);
    ys[k] = cy + rng.gaussian(0, spread * 0.6);
    cruise[k] = rng.range(0.8, 1.2);
    groups[rng.int(0, palette.length)].push(k);
  }

  // Faint veils are applied every veilEvery steps at the equivalent stronger alpha.
  let veilEvery = 1;
  let veilAlpha = trail;
  if (trail < VEIL_MIN) {
    veilEvery = Math.max(1, Math.round(log(1 - VEIL_MIN) / log(1 - trail)));
    veilAlpha = 1 - pow(1 - trail, veilEvery);
  }

  const nodes = (GX + 1) * (GY + 1);
  return {
    n, xs, ys, vx, vy, cruise, flock, flocks, groups, wind, detail, veilEvery,
    fx: new Float64Array(flocks),
    fy: new Float64Array(flocks),
    fvx: new Float64Array(flocks),
    fvy: new Float64Array(flocks),
    fn: new Float64Array(flocks),
    gx: new Float64Array(flocks),
    gy: new Float64Array(flocks),
    pot: new Float64Array((GX + 3) * (GY + 3)),
    windX: new Float64Array(nodes),
    windY: new Float64Array(nodes),
    rho: new Float64Array(nodes),
    rhoX: new Float64Array(nodes),
    rhoY: new Float64Array(nodes),
    lx: Float64Array.from(xs),
    ly: Float64Array.from(ys),
    strokes: palette.map((c) => rgba(c, STROKE_ALPHA)),
    freq: (params.noiseScale as number) / W,
    speed: params.speed as number,
    radius: params.radius as number,
    repel: params.mode === 'repel',
    background,
    veil: rgba(background, veilAlpha),
  };
}

/** Wind on the grid: curl of a two-octave noise potential (divergence-free). */
function updateWind(s: State, i: number): void {
  const { pot, windX, windY, wind, detail, freq } = s;
  const z = i * TIME_RATE;
  const zd = z * 1.7 + 31.4;
  const fd = freq * DETAIL;
  const PW = GX + 3;
  for (let gy = -1; gy <= GY + 1; gy++) {
    const y = gy * CELL;
    for (let gx = -1; gx <= GX + 1; gx++) {
      const x = gx * CELL;
      pot[(gy + 1) * PW + gx + 1] = wind(x * freq, y * freq, z) + 0.6 * detail(x * fd, y * fd, zd);
    }
  }
  for (let gy = 0; gy <= GY; gy++) {
    for (let gx = 0; gx <= GX; gx++) {
      const c = (gy + 1) * PW + gx + 1;
      const o = gy * (GX + 1) + gx;
      windX[o] = pot[c + PW] - pot[c - PW];
      windY[o] = pot[c - 1] - pot[c + 1];
    }
  }
}

/** Cloud-in-cell crowd density on the grid, and its gradient. */
function updateDensity(s: State): void {
  const { n, xs, ys, rho, rhoX, rhoY } = s;
  const NX = GX + 1;
  rho.fill(0);
  for (let k = 0; k < n; k++) {
    const gx = Math.min(Math.max(xs[k] / CELL, 0), GX - 1e-9);
    const gy = Math.min(Math.max(ys[k] / CELL, 0), GY - 1e-9);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const tx = gx - ix;
    const ty = gy - iy;
    const o = iy * NX + ix;
    rho[o] += (1 - tx) * (1 - ty);
    rho[o + 1] += tx * (1 - ty);
    rho[o + NX] += (1 - tx) * ty;
    rho[o + NX + 1] += tx * ty;
  }
  for (let gy = 0; gy <= GY; gy++) {
    for (let gx = 0; gx <= GX; gx++) {
      const o = gy * NX + gx;
      const l = gx > 0 ? o - 1 : o;
      const r = gx < GX ? o + 1 : o;
      const u = gy > 0 ? o - NX : o;
      const d = gy < GY ? o + NX : o;
      rhoX[o] = (rho[r] - rho[l]) * 0.5;
      rhoY[o] = (rho[d] - rho[u]) * 0.5;
    }
  }
}

function step(ctx: CanvasRenderingContext2D, s: State, i: number, input: InputFrame): void {
  if (i === 0) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
  }
  if (i % s.veilEvery === 0) {
    ctx.fillStyle = s.veil;
    ctx.fillRect(0, 0, W, H);
  }
  if (i % FIELD_EVERY === 0) updateWind(s, i);
  updateDensity(s);

  const { n, xs, ys, vx, vy, cruise, flock, speed, windX, windY, rhoX, rhoY } = s;
  const { fx, fy, fvx, fvy, fn } = s;

  // Flock centres and mean velocities.
  for (let f = 0; f < s.flocks; f++) fx[f] = fy[f] = fvx[f] = fvy[f] = fn[f] = 0;
  for (let k = 0; k < n; k++) {
    const f = flock[k];
    fx[f] += xs[k];
    fy[f] += ys[k];
    fvx[f] += vx[k];
    fvy[f] += vy[k];
    fn[f]++;
  }
  const zr = i * TIME_RATE * ROAM_RATE;
  for (let f = 0; f < s.flocks; f++) {
    const m = fn[f] > 0 ? 1 / fn[f] : 0;
    fx[f] *= m;
    fy[f] *= m;
    fvx[f] *= m;
    fvy[f] *= m;
    // Each flock wanders after a goal that drifts around the middle of the sky.
    s.gx[f] = W / 2 + ROAM_REACH * W * s.wind(17.7 + f * 5.3, 3.1, zr);
    s.gy[f] = H / 2 + ROAM_REACH * H * s.wind(-9.2 + f * 5.3, 11.4, zr);
  }

  // Space: one radial impulse away from the pointer (or the centre).
  if (input.keys.includes(' ')) {
    const ox = input.pointer ? input.pointer.x : W / 2;
    const oy = input.pointer ? input.pointer.y : H / 2;
    for (let k = 0; k < n; k++) {
      const dx = xs[k] - ox;
      const dy = ys[k] - oy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const kick = (SCATTER * speed) / (1 + d / 300);
      if (d > 0.5) {
        vx[k] += (dx / d) * kick;
        vy[k] += (dy / d) * kick;
      } else {
        vx[k] += kick;
      }
    }
  }

  const held = input.pointer && input.pointer.down ? input.pointer : null;
  const r = s.radius;
  const maxV = speed * MAX_SPEED_MUL;
  const NX = GX + 1;
  const press = PRESSURE * speed;
  const coh = COHESION * speed;
  const roam = ROAM * speed;

  for (let k = 0; k < n; k++) {
    const x = xs[k];
    const y = ys[k];
    const f = flock[k];

    // Bilinear lookups into the wind and density-gradient grids.
    const gx = Math.min(Math.max(x / CELL, 0), GX - 1e-9);
    const gy = Math.min(Math.max(y / CELL, 0), GY - 1e-9);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const tx = gx - ix;
    const ty = gy - iy;
    const o = iy * NX + ix;
    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;
    let wx = windX[o] * w00 + windX[o + 1] * w10 + windX[o + NX] * w01 + windX[o + NX + 1] * w11;
    let wy = windY[o] * w00 + windY[o + 1] * w10 + windY[o + NX] * w01 + windY[o + NX + 1] * w11;
    const px = rhoX[o] * w00 + rhoX[o + 1] * w10 + rhoX[o + NX] * w01 + rhoX[o + NX + 1] * w11;
    const py = rhoY[o] * w00 + rhoY[o + 1] * w10 + rhoY[o + NX] * w01 + rhoY[o + NX + 1] * w11;

    const wl = Math.sqrt(wx * wx + wy * wy);
    const c = speed * cruise[k];
    if (wl > 1e-12) {
      wx *= c / wl;
      wy *= c / wl;
    }

    let ux = vx[k];
    let uy = vy[k];
    ux += (wx - ux) * STEER + (fvx[f] - ux) * ALIGN + (fx[f] - x) * coh - px * press + (s.gx[f] - fx[f]) * roam;
    uy += (wy - uy) * STEER + (fvy[f] - uy) * ALIGN + (fy[f] - y) * coh - py * press + (s.gy[f] - fy[f]) * roam;

    if (x < MARGIN) ux += (MARGIN - x) * WALL;
    else if (x > W - MARGIN) ux -= (x - W + MARGIN) * WALL;
    if (y < MARGIN) uy += (MARGIN - y) * WALL;
    else if (y > H - MARGIN) uy -= (y - H + MARGIN) * WALL;

    if (held) {
      const dx = held.x - x;
      const dy = held.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < r && d > 1) {
        const pf = (1 - d / r) * PULL * speed;
        const nx = dx / d;
        const ny = dy / d;
        if (s.repel) {
          ux -= nx * pf * 1.6;
          uy -= ny * pf * 1.6;
        } else {
          ux += (nx - ny * SWIRL) * pf;
          uy += (ny + nx * SWIRL) * pf;
        }
      }
    }

    const v = Math.sqrt(ux * ux + uy * uy);
    if (v > maxV) {
      ux *= maxV / v;
      uy *= maxV / v;
    }
    vx[k] = ux;
    vy[k] = uy;
    xs[k] = x + ux;
    ys[k] = y + uy;
  }

  // Each bird extends its trail every DRAW_STRIDE steps (staggered by index),
  // or sooner when flying fast: the polyline looks the same and the canvas
  // sees a fraction of the calls.
  const { lx, ly } = s;
  const phase = i % DRAW_STRIDE;
  ctx.lineWidth = LINE_WIDTH;
  for (let g = 0; g < s.groups.length; g++) {
    const members = s.groups[g];
    if (members.length === 0) continue;
    ctx.strokeStyle = s.strokes[g];
    ctx.beginPath();
    for (const k of members) {
      if (k % DRAW_STRIDE !== phase) {
        const dx = xs[k] - lx[k];
        const dy = ys[k] - ly[k];
        if (dx * dx + dy * dy < MAX_SEGMENT * MAX_SEGMENT) continue;
      }
      ctx.moveTo(lx[k], ly[k]);
      ctx.lineTo(xs[k], ys[k]);
      lx[k] = xs[k];
      ly[k] = ys[k];
    }
    ctx.stroke();
  }
}

const piece: PieceDefinition<State> = {
  slug: 'murmuration',
  version: 1,
  title: 'Murmuration',
  description: 'Flocks of light on a turning wind. Drag to gather them; press Space to scatter them.',
  aspect: ASPECT,
  schema,
  interactive: true,
  accumulates: true,
  featured: [
    // Dusk palette, 1500 birds, longer trails; two vortex eyes. Seed dusk-b2, n=2400.
    'eyJ2IjoxLCJzIjoiZHVzay1iMiIsInAiOnsiY291bnQiOjE1MDAsInNwZWVkIjoxLjYsIm5vaXNlU2NhbGUiOjEuOCwidHJhaWwiOjAuMDYsInJhZGl1cyI6MTYwLCJtb2RlIjoiYXR0cmFjdCIsInBhbGV0dGUiOlsiI2Y0ZDZiOCIsIiNlOTk2N2EiLCIjYzA2MjdlIiwiIzZjNWE5YyIsIiNmNmYxZWEiXSwiYmFja2dyb3VuZCI6IiMwYjBiMTAifSwibiI6MjQwMH0',
    // Winter sky preset on deep navy, 1400 birds in three folding flocks. Seed winter-f6, n=1900.
    'eyJ2IjoxLCJzIjoid2ludGVyLWY2IiwicCI6eyJjb3VudCI6MTQwMCwic3BlZWQiOjEuNiwibm9pc2VTY2FsZSI6MS44LCJ0cmFpbCI6MC4wNiwicmFkaXVzIjoxNjAsIm1vZGUiOiJhdHRyYWN0IiwicGFsZXR0ZSI6WyIjZWFmNGY0IiwiI2E5ZDZlNSIsIiM2MWE1YzIiLCIjMmM3ZGEwIiwiI2NkYjRkYiJdLCJiYWNrZ3JvdW5kIjoiIzBhMTQyMiJ9LCJuIjoxOTAwfQ',
    // Ember preset on warm black, faster birds, one sweeping cloud. Seed ember-c3, n=1700.
    'eyJ2IjoxLCJzIjoiZW1iZXItYzMiLCJwIjp7ImNvdW50IjoxMTAwLCJzcGVlZCI6Mi4yLCJub2lzZVNjYWxlIjoxLjgsInRyYWlsIjowLjA2LCJyYWRpdXMiOjE2MCwibW9kZSI6ImF0dHJhY3QiLCJwYWxldHRlIjpbIiNmZmUzYTMiLCIjZmZiMzVjIiwiI2YwNzYzZiIsIiNiODQwNWUiLCIjZmZmNGUwIl0sImJhY2tncm91bmQiOiIjMTQwYjBhIn0sIm4iOjE3MDB9',
  ],
  snapshotCodes: [
    // mode: 'repel', otherwise defaults, seed snaprepel01, n=600.
    'eyJ2IjoxLCJzIjoic25hcHJlcGVsMDEiLCJwIjp7ImNvdW50Ijo2MDAsInNwZWVkIjoxLjYsIm5vaXNlU2NhbGUiOjEuOCwidHJhaWwiOjAuMDgsInJhZGl1cyI6MTYwLCJtb2RlIjoicmVwZWwiLCJwYWxldHRlIjpbIiNmNGQ2YjgiLCIjZTk5NjdhIiwiI2MwNjI3ZSIsIiM2YzVhOWMiLCIjZjZmMWVhIl0sImJhY2tncm91bmQiOiIjMGIwYjEwIn0sIm4iOjYwMH0',
  ],
  setup,
  step,
  steps: () => Infinity,
};

export default piece;
