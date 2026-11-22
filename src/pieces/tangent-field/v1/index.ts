/**
 * tangent-field v1 - ported from the 2019 p5.js "Flow Field/Tutorial" sketch.
 *
 * Thousands of short strokes scattered over the canvas, each turned to the
 * angle (tan(x * f) + tan(y * f)) * PI / 2. Near tan's asymptotes the angle
 * spins wildly, which gives the field its grid of calm bands and frayed seams.
 * The optional shear is applied once per stroke and compounds, so later
 * strokes are swung further: the field curls. The sketch drew on a 400-unit
 * canvas; geometry keeps those units, scaled up to the logical space.
 *
 * FROZEN once deployed: changing behaviour here changes every share code.
 */
import { PI, cos, sin, tan } from '@/lib/art/math';
import type { Rng } from '@/lib/art/rng';
import { rgba } from '@/lib/art/color';
import type { ParamSchema, Params, PieceDefinition } from '@/lib/piece/types';

const ASPECT = 1;
const W = 1000;
const H = W / ASPECT;
const SRC = 400;
const K = W / SRC;
const TARGET_STEPS = 300;

const PALETTES: string[][] = [
  ['#a0a0a0'],
  ['#f5553e', '#688a94'],
  ['#17d297', '#96b7b5', '#dcdcdc'],
  ['#e9c46a', '#f4a261', '#e76f51'],
];

const schema: ParamSchema = {
  frequency: {
    kind: 'integer', default: 500, min: 1, max: 2000,
    label: 'Frequency', description: 'How tightly the tangent bands repeat.', group: 'Field',
  },
  shear: {
    kind: 'integer', default: 0, min: 0, max: 720,
    label: 'Shear', description: 'Compounding shear per stroke; curls the field.', group: 'Field',
  },
  count: {
    kind: 'integer', default: 11000, min: 500, max: 20000,
    label: 'Strokes', group: 'Strokes',
  },
  maxLength: {
    kind: 'number', default: 60, min: 4, max: 200, step: 1,
    label: 'Max length', group: 'Strokes',
  },
  lineWidth: {
    kind: 'number', default: 1, min: 0.25, max: 4, step: 0.05,
    label: 'Line width', group: 'Strokes',
  },
  alpha: {
    kind: 'number', default: 0.39, min: 0.02, max: 1, step: 0.01,
    label: 'Alpha', group: 'Color',
  },
  palette: {
    kind: 'palette', default: PALETTES[0], minColors: 1, maxColors: 6, presets: PALETTES,
    label: 'Palette', group: 'Color',
  },
  background: { kind: 'color', default: '#1e1e1e', label: 'Background', group: 'Color' },
};

interface State {
  /** Per stroke: transform a b c d e f (sketch units), length, colour index. */
  m: Float64Array;
  len: Float64Array;
  color: Uint8Array;
  colors: string[];
  lineWidth: number;
  perStep: number;
  steps: number;
  background: string;
}

function setup(params: Params, rng: Rng): State {
  const count = params.count as number;
  const f = (params.frequency as number) / 50000;
  const shear = (params.shear as number) / 500000;
  const maxLength = params.maxLength as number;
  const palette = params.palette as string[];
  const alpha = params.alpha as number;

  // Running shear matrix [a c; b d]: each stroke post-multiplies
  // shearX(s) * shearY(-s), exactly as the sketch's loop did.
  const sx = tan(shear);
  const sy = tan(-shear);
  let a = 1, b = 0, c = 0, d = 1;
  const m = new Float64Array(count * 6);
  const len = new Float64Array(count);
  const color = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const x = rng.next() * SRC;
    const y = rng.next() * SRC;
    const v = (tan(x * f) + tan(y * f)) * PI * 0.5;
    if (shear !== 0) {
      // shearX: [1 sx; 0 1], then shearY: [1 0; sy 1].
      const c1 = a * sx + c;
      const d1 = b * sx + d;
      const a2 = a + c1 * sy;
      const b2 = b + d1 * sy;
      a = a2; b = b2; c = c1; d = d1;
    }
    // M * translate(x, y) * rotate(v)
    const cv = cos(v);
    const sv = sin(v);
    const o = i * 6;
    m[o] = a * cv + c * sv;
    m[o + 1] = b * cv + d * sv;
    m[o + 2] = -a * sv + c * cv;
    m[o + 3] = -b * sv + d * cv;
    m[o + 4] = a * x + c * y;
    m[o + 5] = b * x + d * y;
    len[i] = rng.next() * maxLength;
    color[i] = palette.length > 1 ? rng.int(0, palette.length) : 0;
  }
  const perStep = Math.max(1, Math.ceil(count / TARGET_STEPS));
  return {
    m, len, color,
    colors: palette.map((h) => rgba(h, alpha)),
    lineWidth: params.lineWidth as number,
    perStep,
    steps: Math.ceil(count / perStep),
    background: params.background as string,
  };
}

function step(ctx: CanvasRenderingContext2D, s: State, i: number): void {
  if (i === 0) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, W, H);
  }
  const end = Math.min(s.len.length, (i + 1) * s.perStep);
  for (let k = i * s.perStep; k < end; k++) {
    const o = k * 6;
    ctx.save();
    ctx.scale(K, K);
    ctx.transform(s.m[o], s.m[o + 1], s.m[o + 2], s.m[o + 3], s.m[o + 4], s.m[o + 5]);
    ctx.strokeStyle = s.colors[s.color[k]];
    ctx.lineWidth = s.lineWidth;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s.len[k], 1);
    ctx.stroke();
    ctx.restore();
  }
}

const piece: PieceDefinition<State> = {
  slug: 'tangent-field',
  version: 1,
  title: 'Tangent Field',
  description: 'Short strokes turned by a field of tangents, frayed at the asymptotes (2019 sketch).',
  aspect: ASPECT,
  schema,
  featured: [
    // Artist's pick (main preview): mint, grey and white on near-black, broad sweeps, seed 6a28h8o3gm.
    'eyJ2IjoxLCJzIjoiNmEyOGg4bzNnbSIsInAiOnsiZnJlcXVlbmN5IjoxNDEsInNoZWFyIjowLCJjb3VudCI6MjAwMDAsIm1heExlbmd0aCI6NDAsImxpbmVXaWR0aCI6MS4wNSwiYWxwaGEiOjAuMzksInBhbGV0dGUiOlsiIzE3ZDI5NyIsIiM5NmI3YjUiLCIjZGNkY2RjIl0sImJhY2tncm91bmQiOiIjMGYwZjBmIn19',
    // Orange and blue on plum, finer bands, denser, seed pur.
    'eyJ2IjoxLCJzIjoicHVyIiwicCI6eyJmcmVxdWVuY3kiOjkwMCwic2hlYXIiOjAsImNvdW50IjoxNjAwMCwibWF4TGVuZ3RoIjo2MCwibGluZVdpZHRoIjoxLCJhbHBoYSI6MC4zLCJwYWxldHRlIjpbIiNmNTU1M2UiLCIjNjg4YTk0Il0sImJhY2tncm91bmQiOiIjMzEyNzJkIn19',
    // Defaults: grey strokes on charcoal, seed f1.
    'eyJ2IjoxLCJzIjoiZjEiLCJwIjp7ImZyZXF1ZW5jeSI6NTAwLCJzaGVhciI6MCwiY291bnQiOjExMDAwLCJtYXhMZW5ndGgiOjYwLCJsaW5lV2lkdGgiOjEsImFscGhhIjowLjM5LCJwYWxldHRlIjpbIiNhMGEwYTAiXSwiYmFja2dyb3VuZCI6IiMxZTFlMWUifX0',
  ],
  snapshotCodes: [
    // Mid-build stop step n=100, defaults, seed snapmid.
    'eyJ2IjoxLCJzIjoic25hcG1pZCIsInAiOnsiZnJlcXVlbmN5Ijo1MDAsInNoZWFyIjowLCJjb3VudCI6MTEwMDAsIm1heExlbmd0aCI6NjAsImxpbmVXaWR0aCI6MSwiYWxwaGEiOjAuMzksInBhbGV0dGUiOlsiI2EwYTBhMCJdLCJiYWNrZ3JvdW5kIjoiIzFlMWUxZSJ9LCJuIjoxMDB9',
  ],
  setup,
  step: (ctx, state, i) => step(ctx, state, i),
  steps: (state) => state.steps,
};

export default piece;
