/**
 * bezier-drift v1 - ported from the 2019 p5.js "Playground/01" sketch.
 *
 * Two faint Bezier curves are drawn every step and never cleared. One end of
 * each curve rides tan(step) (in degrees) along the diagonal, so it sweeps out
 * to infinity and back twice per 360 steps, while one control point jitters
 * at random. The translucent curves pile up into two veils. Geometry keeps
 * the sketch's units; its 1800 x 900 canvas left everything right of x = 1000
 * empty, so the piece frames a square window around where the curves fall.
 *
 * FROZEN once deployed: changing behaviour here changes every share code.
 */
import { PI, clamp, tan } from '@/lib/art/math';
import type { Rng } from '@/lib/art/rng';
import { rgba } from '@/lib/art/color';
import type { ParamSchema, Params, PieceDefinition } from '@/lib/piece/types';

const ASPECT = 1;
const W = 1000;
const H = W / ASPECT;
/** Window onto the sketch canvas: top-left corner and side, in sketch units. */
const VIEW_X = -60;
const VIEW_Y = -50;
const VIEW = 1000;
const K = W / VIEW;
const FAR = 100000; // tan() is clamped to this many units

const PALETTES: string[][] = [
  ['#f5553e', '#688a94'],
  ['#82ff8a', '#ff6161'],
  ['#c03221', '#545e75'],
  ['#e9c46a', '#2a9d8f'],
];

const schema: ParamSchema = {
  frames: {
    kind: 'integer', default: 360, min: 30, max: 1440,
    label: 'Frames', description: 'Pairs of curves drawn; 180 is one full sweep of the tangent.', group: 'Drift',
  },
  rate: {
    kind: 'number', default: 1, min: 0.25, max: 6, step: 0.25,
    label: 'Rate', description: 'Degrees the tangent advances per frame.', group: 'Drift',
  },
  jitter: {
    kind: 'number', default: 1, min: 0, max: 3, step: 0.05,
    label: 'Jitter', description: 'Scales how far the random control points roam.', group: 'Drift',
  },
  alpha: {
    kind: 'number', default: 0.12, min: 0.01, max: 0.6, step: 0.01,
    label: 'Alpha', group: 'Style',
  },
  lineWidth: {
    kind: 'number', default: 1, min: 0.25, max: 4, step: 0.05,
    label: 'Line width', group: 'Style',
  },
  palette: {
    kind: 'palette', default: PALETTES[0], minColors: 2, maxColors: 2, presets: PALETTES,
    label: 'Palette', group: 'Color',
  },
  background: { kind: 'color', default: '#31272d', label: 'Background', group: 'Color' },
};

interface State {
  /** Per frame: the two random control-point x coordinates (sketch units). */
  r1: Float64Array;
  r2: Float64Array;
  rate: number;
  colors: [string, string];
  lineWidth: number;
  background: string;
}

function setup(params: Params, rng: Rng): State {
  const frames = params.frames as number;
  const jitter = params.jitter as number;
  const r1 = new Float64Array(frames);
  const r2 = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    // random(900, 1000) and random(0, 1000), jitter scaling their spread.
    r1[i] = 950 + (rng.range(900, 1000) - 950) * jitter;
    r2[i] = 500 + (rng.range(0, 1000) - 500) * jitter;
  }
  const [a, b] = params.palette as string[];
  const alpha = params.alpha as number;
  return {
    r1, r2,
    rate: params.rate as number,
    colors: [rgba(a, alpha), rgba(b, alpha)],
    lineWidth: params.lineWidth as number,
    background: params.background as string,
  };
}

function step(ctx: CanvasRenderingContext2D, s: State, i: number): void {
  if (i === 0) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, W, H);
  }
  const t = clamp(tan(((i * s.rate) * PI) / 180), -FAR, FAR);
  ctx.save();
  ctx.scale(K, K);
  ctx.translate(-VIEW_X, -VIEW_Y);
  ctx.lineWidth = s.lineWidth;
  ctx.strokeStyle = s.colors[0];
  ctx.beginPath();
  ctx.moveTo(t, t);
  ctx.bezierCurveTo(300, 1200, s.r1[i], 0, 0, 800);
  ctx.stroke();
  ctx.strokeStyle = s.colors[1];
  ctx.beginPath();
  ctx.moveTo(600, 200);
  ctx.bezierCurveTo(s.r2[i], 1200, 900, 1000, t, t);
  ctx.stroke();
  ctx.restore();
}

const piece: PieceDefinition<State> = {
  slug: 'bezier-drift',
  version: 1,
  title: 'Bezier Drift',
  description: 'Two translucent Bezier curves, one end riding a tangent, layered into veils (2019 sketch).',
  aspect: ASPECT,
  schema,
  featured: [
    // Defaults: 360 frames, orange and blue, seed b1.
    'eyJ2IjoxLCJzIjoiYjEiLCJwIjp7ImZyYW1lcyI6MzYwLCJyYXRlIjoxLCJqaXR0ZXIiOjEsImFscGhhIjowLjEyLCJsaW5lV2lkdGgiOjEsInBhbGV0dGUiOlsiI2Y1NTUzZSIsIiM2ODhhOTQiXSwiYmFja2dyb3VuZCI6IiMzMTI3MmQifX0',
    // 1440 frames at half rate, wide jitter, faint, seed b2.
    'eyJ2IjoxLCJzIjoiYjIiLCJwIjp7ImZyYW1lcyI6MTQ0MCwicmF0ZSI6MC41LCJqaXR0ZXIiOjIuNSwiYWxwaGEiOjAuMDUsImxpbmVXaWR0aCI6MSwicGFsZXR0ZSI6WyIjZjU1NTNlIiwiIzY4OGE5NCJdLCJiYWNrZ3JvdW5kIjoiIzMxMjcyZCJ9fQ',
    // Green and red on grey, seed ggr.
    'eyJ2IjoxLCJzIjoiZ2dyIiwicCI6eyJmcmFtZXMiOjcyMCwicmF0ZSI6MC41LCJqaXR0ZXIiOjEuNiwiYWxwaGEiOjAuMDgsImxpbmVXaWR0aCI6MSwicGFsZXR0ZSI6WyIjODJmZjhhIiwiI2ZmNjE2MSJdLCJiYWNrZ3JvdW5kIjoiIzIzMjMyMyJ9fQ',
  ],
  snapshotCodes: [
    // Mid-build stop step n=90, defaults, seed snapmid.
    'eyJ2IjoxLCJzIjoic25hcG1pZCIsInAiOnsiZnJhbWVzIjozNjAsInJhdGUiOjEsImppdHRlciI6MSwiYWxwaGEiOjAuMTIsImxpbmVXaWR0aCI6MSwicGFsZXR0ZSI6WyIjZjU1NTNlIiwiIzY4OGE5NCJdLCJiYWNrZ3JvdW5kIjoiIzMxMjcyZCJ9LCJuIjo5MH0',
  ],
  local: true,
  accumulates: true,
  setup,
  step: (ctx, state, i) => step(ctx, state, i),
  steps: (state) => state.r1.length,
};

export default piece;
