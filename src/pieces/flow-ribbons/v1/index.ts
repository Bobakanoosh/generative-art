/**
 * flow-ribbons v1 — bundles of translucent strands drift through a seeded
 * noise flow field. Each ribbon is a band of strands launched side by side;
 * they share the field so they travel together, fanning apart where the
 * field diverges. Alpha accumulates step by step.
 *
 * FROZEN once deployed: changing behaviour here changes every share code.
 */
import { HALF_PI, atan2, clamp, cos, sin, smoothstep } from '@/lib/art/math';
import { createNoise2D } from '@/lib/art/noise';
import type { Rng } from '@/lib/art/rng';
import { mixHex, rgba } from '@/lib/art/color';
import { defineSchema, type ParamsOf, type PieceDefinition } from '@/lib/piece/types';

const ASPECT = 4 / 5;
const W = 1000;
const H = W / ASPECT;
const MARGIN = 70;
const SPEED = 2.4; // logical units per step
const BANDS = 3; // colour sub-bands per ribbon
const EDGE_FADE = 60;

const PALETTES: string[][] = [
  ['#e9c46a', '#f4a261', '#e76f51', '#2a9d8f', '#ecdcc4'],
  ['#caf0f8', '#90e0ef', '#00b4d8', '#0077b6', '#f1faee'],
  ['#f72585', '#b5179e', '#7209b7', '#4cc9f0', '#f8f8ff'],
  ['#fefae0', '#dda15e', '#bc6c25', '#a3b18a', '#588157'],
];

const schema = defineSchema({
  particles: {
    kind: 'integer', default: 1800, min: 200, max: 6000,
    label: 'Particles', description: 'Total strands across all ribbons.', group: 'Flow',
  },
  length: {
    kind: 'integer', default: 320, min: 50, max: 800,
    label: 'Length', description: 'Steps each strand travels.', group: 'Flow',
  },
  noiseScale: {
    kind: 'number', default: 1.6, min: 0.3, max: 6, step: 0.05,
    label: 'Noise scale', description: 'Frequency of the flow field.', group: 'Flow',
  },
  turbulence: {
    kind: 'number', default: 0.8, min: 0, max: 3, step: 0.05,
    label: 'Turbulence', description: 'Fine-grained swirl on top of the main field.', group: 'Flow',
  },
  lineWidth: {
    kind: 'number', default: 0.9, min: 0.2, max: 4, step: 0.05,
    label: 'Line width', group: 'Style',
  },
  alpha: {
    kind: 'number', default: 0.1, min: 0.01, max: 0.6, step: 0.01,
    label: 'Alpha', description: 'Opacity of each segment; overlaps accumulate.', group: 'Style',
  },
  palette: {
    kind: 'palette', default: PALETTES[0], minColors: 2, maxColors: 8, presets: PALETTES,
    label: 'Palette', group: 'Color',
  },
  background: { kind: 'color', default: '#0f1117', label: 'Background', group: 'Color' },
  mode: { kind: 'select', default: 'lines', options: ['lines', 'dots'], label: 'Mode', group: 'Style' },
  fadeIn: {
    kind: 'boolean', default: true,
    label: 'Fade in', description: 'Ribbons emerge gradually instead of starting abruptly.', group: 'Style',
  },
});
type P = ParamsOf<typeof schema>;

interface Band {
  color: string;
  width: number;
  strands: number[]; // indices into the strand arrays
}

interface Ribbon {
  life: number; // steps this ribbon draws for
  bands: Band[];
}

interface State {
  xs: Float64Array;
  ys: Float64Array;
  alive: Uint8Array;
  phase: Uint8Array; // dot stagger
  ribbons: Ribbon[];
  steps: number;
  alpha: number;
  fadeIn: boolean;
  dots: boolean;
  background: string;
  field: (x: number, y: number) => number;
}

/**
 * Curl of a scalar noise potential: divergence-free, so ribbons keep their
 * width instead of collapsing into sinks. Returns a heading in radians.
 */
function makeField(rng: Rng, noiseScale: number, turbulence: number) {
  const main = createNoise2D(rng);
  const detail = createNoise2D(rng);
  const f = noiseScale / W;
  const fd = f * 3.1;
  const td = turbulence * 0.3;
  const eps = 0.5;
  const potential = (x: number, y: number) =>
    main(x * f, y * f) + td * detail(x * fd + 17.3, y * fd - 4.1);
  return (x: number, y: number) => {
    const dy = potential(x, y + eps) - potential(x, y - eps);
    const dx = potential(x + eps, y) - potential(x - eps, y);
    return atan2(-dx, dy);
  };
}

/** 0 outside the frame, ramping to 1 over EDGE_FADE units inside it. */
function edgeFade(x: number, y: number) {
  const d = Math.min(x - MARGIN, W - MARGIN - x, y - MARGIN, H - MARGIN - y);
  return d <= 0 ? 0 : d >= EDGE_FADE ? 1 : smoothstep(0, EDGE_FADE, d);
}

function setup(params: P, rng: Rng): State {
  const particles = params.particles;
  const length = params.length;
  const palette = params.palette;
  const field = makeField(rng, params.noiseScale, params.turbulence);
  const lineWidth = params.lineWidth;

  const ribbonCount = clamp(Math.round(Math.sqrt(particles) * 0.8), 5, 90);
  const xs = new Float64Array(particles);
  const ys = new Float64Array(particles);
  const alive = new Uint8Array(particles);
  const phase = new Uint8Array(particles);
  const ribbons: Ribbon[] = [];

  // Ribbon widths vary a lot; strands are shared out in proportion to width
  // so every ribbon has a similar density.
  const spans: number[] = [];
  for (let r = 0; r < ribbonCount; r++) spans.push(rng.range(0, 1) < 0.15 ? rng.range(50, 110) : rng.range(8, 45));
  let spanTotal = 0;
  for (const sp of spans) spanTotal += sp;

  let next = 0;
  let spanSeen = 0;
  for (let r = 0; r < ribbonCount; r++) {
    const span = spans[r];
    spanSeen += span;
    const target = r === ribbonCount - 1 ? particles : Math.round((particles * spanSeen) / spanTotal);
    const count = Math.max(0, Math.min(particles, target) - next);
    const cx = rng.range(MARGIN, W - MARGIN);
    const cy = rng.range(MARGIN, H - MARGIN);
    const a = field(cx, cy) + HALF_PI;
    const ci = rng.int(0, palette.length);
    const c0 = palette[ci];
    const c1 = palette[(ci + 1) % palette.length];
    const widthMul = rng.range(0.6, 1.5);
    const bands: Band[] = [];
    for (let b = 0; b < BANDS; b++) {
      bands.push({
        color: mixHex(c0, c1, (b / (BANDS - 1)) * 0.45),
        width: lineWidth * widthMul * (b === 1 ? 1 : 0.8),
        strands: [],
      });
    }
    for (let k = 0; k < count; k++) {
      const idx = next + k;
      const t = count > 1 ? k / (count - 1) - 0.5 : 0;
      const off = t * span + rng.gaussian(0, 0.8);
      xs[idx] = cx + cos(a) * off;
      ys[idx] = cy + sin(a) * off;
      alive[idx] = edgeFade(xs[idx], ys[idx]) > 0 ? 1 : 0;
      phase[idx] = rng.int(0, 4);
      bands[Math.min(BANDS - 1, Math.floor((t + 0.5) * BANDS))].strands.push(idx);
    }
    next += count;
    ribbons.push({ life: Math.round(length * rng.range(0.7, 1)), bands });
  }

  return {
    xs, ys, alive, phase, ribbons, field,
    steps: length,
    alpha: params.alpha,
    fadeIn: params.fadeIn,
    dots: params.mode === 'dots',
    background: params.background,
  };
}

function step(ctx: CanvasRenderingContext2D, s: State, i: number): void {
  if (i === 0) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.75);
    glow.addColorStop(0, rgba(mixHex(s.background, '#ffffff', 0.06), 1));
    glow.addColorStop(1, rgba(s.background, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'butt';
  }
  const { xs, ys, alive, field } = s;
  for (const ribbon of s.ribbons) {
    if (i >= ribbon.life) continue;
    const u = i / ribbon.life;
    let fade = 1 - smoothstep(0.75, 1, u);
    if (s.fadeIn) fade *= smoothstep(0, 0.25, u);
    const a = s.alpha * fade;
    for (const band of ribbon.bands) {
      if (s.dots) ctx.fillStyle = band.color;
      else {
        ctx.strokeStyle = band.color;
        ctx.lineWidth = band.width;
      }
      const d = band.width * 1.6;
      for (const idx of band.strands) {
        if (!alive[idx]) continue;
        const x0 = xs[idx];
        const y0 = ys[idx];
        const ang = field(x0, y0);
        const x1 = x0 + cos(ang) * SPEED;
        const y1 = y0 + sin(ang) * SPEED;
        xs[idx] = x1;
        ys[idx] = y1;
        const e = edgeFade(x1, y1);
        if (e <= 0) {
          alive[idx] = 0;
          continue;
        }
        const sa = a * e;
        if (sa <= 0.002) continue;
        if (s.dots) {
          if ((i + s.phase[idx]) % 4 !== 0) continue;
          ctx.globalAlpha = clamp(sa * 2, 0, 1);
          ctx.fillRect(x1 - d / 2, y1 - d / 2, d, d);
        } else {
          ctx.globalAlpha = sa;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

const piece: PieceDefinition<State, P> = {
  slug: 'flow-ribbons',
  version: 1,
  title: 'Flow Ribbons',
  description: 'Bundles of translucent strands drifting through a noise flow field.',
  aspect: ASPECT,
  schema,
  featured: [
    // Default palette, seed 4474om17pk.
    'eyJ2IjoxLCJzIjoiNDQ3NG9tMTdwayIsInAiOnsicGFydGljbGVzIjoxODAwLCJsZW5ndGgiOjMyMCwibm9pc2VTY2FsZSI6MS42LCJ0dXJidWxlbmNlIjowLjgsImxpbmVXaWR0aCI6MC45LCJhbHBoYSI6MC4xLCJwYWxldHRlIjpbIiNlOWM0NmEiLCIjZjRhMjYxIiwiI2U3NmY1MSIsIiMyYTlkOGYiLCIjZWNkY2M0Il0sImJhY2tncm91bmQiOiIjMGYxMTE3IiwibW9kZSI6ImxpbmVzIiwiZmFkZUluIjp0cnVlfX0',
    // Ocean preset on navy, seed 9q4krlyom9.
    'eyJ2IjoxLCJzIjoiOXE0a3JseW9tOSIsInAiOnsicGFydGljbGVzIjoxODAwLCJsZW5ndGgiOjMyMCwibm9pc2VTY2FsZSI6MS42LCJ0dXJidWxlbmNlIjowLjgsImxpbmVXaWR0aCI6MC45LCJhbHBoYSI6MC4xLCJwYWxldHRlIjpbIiNjYWYwZjgiLCIjOTBlMGVmIiwiIzAwYjRkOCIsIiMwMDc3YjYiLCIjZjFmYWVlIl0sImJhY2tncm91bmQiOiIjMGExNDI0IiwibW9kZSI6ImxpbmVzIiwiZmFkZUluIjp0cnVlfX0',
    // Dusk preset on plum, seed 7b7vqfzfyx.
    'eyJ2IjoxLCJzIjoiN2I3dnFmemZ5eCIsInAiOnsicGFydGljbGVzIjoxODAwLCJsZW5ndGgiOjMyMCwibm9pc2VTY2FsZSI6MS42LCJ0dXJidWxlbmNlIjowLjgsImxpbmVXaWR0aCI6MC45LCJhbHBoYSI6MC4xLCJwYWxldHRlIjpbIiNmNzI1ODUiLCIjYjUxNzllIiwiIzcyMDliNyIsIiM0Y2M5ZjAiLCIjZjhmOGZmIl0sImJhY2tncm91bmQiOiIjMGQwYTE0IiwibW9kZSI6ImxpbmVzIiwiZmFkZUluIjp0cnVlfX0',
  ],
  snapshotCodes: [
    // mode: 'dots', otherwise defaults, seed snapdots01.
    'eyJ2IjoxLCJzIjoic25hcGRvdHMwMSIsInAiOnsicGFydGljbGVzIjoxODAwLCJsZW5ndGgiOjMyMCwibm9pc2VTY2FsZSI6MS42LCJ0dXJidWxlbmNlIjowLjgsImxpbmVXaWR0aCI6MC45LCJhbHBoYSI6MC4xLCJwYWxldHRlIjpbIiNlOWM0NmEiLCIjZjRhMjYxIiwiI2U3NmY1MSIsIiMyYTlkOGYiLCIjZWNkY2M0Il0sImJhY2tncm91bmQiOiIjMGYxMTE3IiwibW9kZSI6ImRvdHMiLCJmYWRlSW4iOnRydWV9fQ',
    // fadeIn: false, otherwise defaults, seed snapfade01.
    'eyJ2IjoxLCJzIjoic25hcGZhZGUwMSIsInAiOnsicGFydGljbGVzIjoxODAwLCJsZW5ndGgiOjMyMCwibm9pc2VTY2FsZSI6MS42LCJ0dXJidWxlbmNlIjowLjgsImxpbmVXaWR0aCI6MC45LCJhbHBoYSI6MC4xLCJwYWxldHRlIjpbIiNlOWM0NmEiLCIjZjRhMjYxIiwiI2U3NmY1MSIsIiMyYTlkOGYiLCIjZWNkY2M0Il0sImJhY2tncm91bmQiOiIjMGYxMTE3IiwibW9kZSI6ImxpbmVzIiwiZmFkZUluIjpmYWxzZX19',
    // Forest preset, non-default flow/style params, seed snapforest.
    'eyJ2IjoxLCJzIjoic25hcGZvcmVzdCIsInAiOnsicGFydGljbGVzIjo5MDAsImxlbmd0aCI6NTAwLCJub2lzZVNjYWxlIjozLjIsInR1cmJ1bGVuY2UiOjEuNSwibGluZVdpZHRoIjoyLCJhbHBoYSI6MC4yNSwicGFsZXR0ZSI6WyIjZmVmYWUwIiwiI2RkYTE1ZSIsIiNiYzZjMjUiLCIjYTNiMThhIiwiIzU4ODE1NyJdLCJiYWNrZ3JvdW5kIjoiIzFiMWExNCIsIm1vZGUiOiJsaW5lcyIsImZhZGVJbiI6dHJ1ZX19',
    // Mid-build stop step n=120, defaults, seed snapmidbuild.
    'eyJ2IjoxLCJzIjoic25hcG1pZGJ1aWxkIiwicCI6eyJwYXJ0aWNsZXMiOjE4MDAsImxlbmd0aCI6MzIwLCJub2lzZVNjYWxlIjoxLjYsInR1cmJ1bGVuY2UiOjAuOCwibGluZVdpZHRoIjowLjksImFscGhhIjowLjEsInBhbGV0dGUiOlsiI2U5YzQ2YSIsIiNmNGEyNjEiLCIjZTc2ZjUxIiwiIzJhOWQ4ZiIsIiNlY2RjYzQiXSwiYmFja2dyb3VuZCI6IiMwZjExMTciLCJtb2RlIjoibGluZXMiLCJmYWRlSW4iOnRydWV9LCJuIjoxMjB9',
  ],
  setup,
  step: (ctx, state, i) => step(ctx, state, i),
  steps: (state) => state.steps,
};

export default piece;
