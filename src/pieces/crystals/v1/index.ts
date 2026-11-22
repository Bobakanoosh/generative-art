/**
 * crystals v1 - ported from the 2019 p5.js "tutorial" crystal sketch.
 *
 * A grid of crystals. Each crystal stacks 2-4 randomly chosen layers (outline,
 * centred shape, stepped hexagons, ring of shapes, dotted lines, simple lines,
 * circles), drawn with radial symmetry around the crystal's centre. Layer
 * geometry is in the sketch's units (a crystal is 150 across) and scaled to
 * the grid cell. The build draws one layer per step.
 *
 * FROZEN once deployed: changing behaviour here changes every share code.
 */
import { PI, cos, sin } from '@/lib/art/math';
import type { Rng } from '@/lib/art/rng';
import { defineSchema, type ParamsOf, type PieceDefinition } from '@/lib/piece/types';

const ASPECT = 3 / 4;
const W = 1000;
const H = W / ASPECT;
const SIZE = 150; // crystal diameter in sketch units
const HALF = SIZE / 2;
const STEPS_OUT = 8;
const SINGLE_STEP = HALF / STEPS_OUT;
const DEG = PI / 180;

const PALETTES: string[][] = [
  ['#f5553e', '#688a94'],
  ['#82ff8a', '#ff6161'],
  ['#545e75', '#c03221'],
  ['#17d297', '#96b7b5', '#dcdcdc', '#202543'],
];

const schema = defineSchema({
  columns: {
    kind: 'integer', default: 3, min: 1, max: 8,
    label: 'Columns', description: 'Crystals per row; rows fill the frame.', group: 'Layout',
  },
  sides: {
    kind: 'integer', default: 3, min: 2, max: 12,
    label: 'Sides', description: 'Order of each crystal\'s rotational symmetry.', group: 'Shape',
  },
  minLayers: {
    kind: 'integer', default: 2, min: 1, max: 5,
    label: 'Min layers', group: 'Shape',
  },
  maxLayers: {
    kind: 'integer', default: 4, min: 1, max: 7,
    label: 'Max layers', group: 'Shape',
  },
  palette: {
    kind: 'palette', default: PALETTES[0], minColors: 1, maxColors: 6, presets: PALETTES,
    label: 'Palette', group: 'Color',
  },
  background: { kind: 'color', default: '#31272d', label: 'Background', group: 'Color' },
});
type P = ParamsOf<typeof schema>;

type Layer =
  | { kind: 'circles'; color: string; sides: number }
  | { kind: 'lines'; color: string; weight: number; sides: number; start: number; end: number }
  | { kind: 'outline'; color: string; weight: number; hexagon: boolean }
  | { kind: 'dots'; color: string; count: number }
  | { kind: 'centered'; color: string; sides: number; shape: number; size: number; radius: number }
  | { kind: 'ring'; color: string; weight: number; sides: number; center: number; radius: number; shape: number; up: boolean }
  | { kind: 'hexagons'; color: string; weight: number; sides: number; steps: number; offset: number; step: number };

interface Crystal { x: number; y: number }
interface Op { crystal: Crystal; layer: Layer }

interface State {
  ops: Op[];
  scale: number;
  background: string;
}

/** The sketch's radius rule shared by CenteredShape and RingOfShapes. */
function stepRadius(rng: Rng, steps: number) {
  if (steps < STEPS_OUT / 2) return Math.floor(rng.range(1, steps)) * SINGLE_STEP;
  if (steps > STEPS_OUT / 2) return Math.floor(rng.range(1, STEPS_OUT - steps)) * SINGLE_STEP;
  return Math.floor(rng.range(1, STEPS_OUT / 2 + 1)) * SINGLE_STEP;
}

const KINDS: { kind: Layer['kind']; chance: number }[] = [
  { kind: 'centered', chance: 0.6 },
  { kind: 'hexagons', chance: 0.6 },
  { kind: 'ring', chance: 0.3 },
  { kind: 'outline', chance: 0.3 },
  { kind: 'dots', chance: 0.3 },
  { kind: 'lines', chance: 0.3 },
  { kind: 'circles', chance: 0.3 },
];

function makeLayer(kind: Layer['kind'], rng: Rng, sides: number, palette: string[]): Layer {
  // Every sketch layer starts with a weight and a colour.
  const weight = rng.pick([1, 3]);
  const color = rng.pick(palette);
  switch (kind) {
    case 'circles':
      return { kind, color, sides };
    case 'lines': {
      const numSteps = rng.pick([STEPS_OUT, Math.floor(STEPS_OUT * 1.25)]);
      const start = Math.floor(rng.range(0, numSteps));
      const end = Math.floor(rng.range(start, numSteps + 1));
      return { kind, color, weight, sides, start, end };
    }
    case 'outline':
      return { kind, color, weight, hexagon: rng.bool() };
    case 'dots':
      return { kind, color, count: rng.pick([sides, sides * 2]) };
    case 'centered': {
      const shape = rng.next();
      const size = Math.floor(rng.range(STEPS_OUT / 2, STEPS_OUT)) * SINGLE_STEP;
      const steps = Math.floor(rng.range(1, STEPS_OUT));
      return { kind, color, sides, shape, size, radius: stepRadius(rng, steps) };
    }
    case 'ring': {
      const steps = Math.floor(rng.range(1, STEPS_OUT));
      const shape = rng.pick([1, 2, 3]);
      const up = rng.bool();
      return { kind, color, weight, sides, center: steps * SINGLE_STEP, shape, up, radius: stepRadius(rng, steps) };
    }
    case 'hexagons': {
      const steps = rng.range(STEPS_OUT, STEPS_OUT * 1.25);
      const offset = HALF * rng.range(0.1, 1);
      return { kind, color, weight, sides, steps, offset, step: (HALF - offset) / steps };
    }
  }
}

function pickLayers(rng: Rng, sides: number, palette: string[], lo: number, hi: number): Layer[] {
  // The sketch rolls every layer and re-rolls until the count is in range.
  for (let attempt = 0; attempt < 200; attempt++) {
    const chosen: Layer[] = [];
    for (const { kind, chance } of KINDS) {
      const layer = makeLayer(kind, rng, sides, palette);
      if (rng.next() > chance) chosen.push(layer);
    }
    if (chosen.length >= lo && chosen.length <= hi) return rng.shuffle(chosen);
  }
  // Practically unreachable; keep the first `lo` kinds so the crystal is never empty.
  return KINDS.slice(0, lo).map(({ kind }) => makeLayer(kind, rng, sides, palette));
}

function setup(params: P, rng: Rng): State {
  const columns = params.columns;
  const sides = params.sides;
  const palette = params.palette;
  const a = params.minLayers;
  const b = params.maxLayers;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  // Sketch layout: cell = crystal + 1/5 padding, half-crystal outer margin.
  const crystal = W / (1 + 1.2 * columns);
  const cell = crystal * 1.2;
  const rows = Math.max(1, Math.floor((H - crystal) / cell));
  const x0 = (W - cell * (columns - 1)) / 2;
  const y0 = (H - cell * (rows - 1)) / 2;

  const ops: Op[] = [];
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const at: Crystal = { x: x0 + c * cell, y: y0 + r * cell };
      for (const layer of pickLayers(rng, sides, palette, lo, hi)) ops.push({ crystal: at, layer });
    }
  }
  return { ops, scale: crystal / SIZE, background: params.background };
}

// --- drawing helpers (sketch units, degrees like the sketch) ---------------

function hexagon(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = k * 60 * DEG;
    const x = r * cos(a);
    const y = r * sin(a);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function triangle(ctx: CanvasRenderingContext2D, center: number, r: number, up: boolean) {
  const base = up ? 0 : 180;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = (base + k * 120) * DEG;
    const x = center + r * cos(a);
    const y = r * sin(a);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, d: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.abs(d) / 2, 0, 2 * PI);
}

function rotate(ctx: CanvasRenderingContext2D, degrees: number) {
  ctx.rotate(degrees * DEG);
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer) {
  switch (l.kind) {
    case 'circles': {
      const size = HALF * 0.93;
      const pos = HALF - size / 2;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 1;
      for (let k = 0; k <= l.sides; k++) {
        ellipse(ctx, pos, 0, size);
        ctx.stroke();
        rotate(ctx, 360 / l.sides);
      }
      return;
    }
    case 'lines':
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.weight;
      for (let k = 0; k < l.sides; k++) {
        ctx.beginPath();
        ctx.moveTo(l.start * SINGLE_STEP, 0);
        ctx.lineTo(l.end * SINGLE_STEP, 0);
        ctx.stroke();
        rotate(ctx, 360 / l.sides);
      }
      return;
    case 'outline':
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.weight;
      if (l.hexagon) hexagon(ctx, HALF);
      else ellipse(ctx, 0, 0, SIZE);
      ctx.stroke();
      return;
    case 'dots': {
      const s = 3;
      ctx.fillStyle = l.color;
      for (let k = 0; k <= l.count; k++) {
        for (let x = SINGLE_STEP; x < HALF; x += SINGLE_STEP) ctx.fillRect(x - s / 2, -s / 2, s, s);
        rotate(ctx, 360 / l.count);
      }
      return;
    }
    case 'centered':
      ctx.fillStyle = l.color;
      if (l.shape < 0.3) {
        triangle(ctx, 0, l.radius, true);
        ctx.fill();
        triangle(ctx, 0, l.radius, false);
        ctx.fill();
      } else if (l.shape < 0.6) {
        ellipse(ctx, 0, 0, l.size * 1.5);
        ctx.fill();
      } else {
        rotate(ctx, 360 / l.sides / 2);
        hexagon(ctx, l.size);
        ctx.fill();
      }
      return;
    case 'ring':
      ctx.strokeStyle = l.color;
      ctx.fillStyle = l.color;
      ctx.lineWidth = l.weight;
      for (let k = 0; k < l.sides; k++) {
        if (l.shape === 1) ellipse(ctx, 0, l.center, l.radius);
        else if (l.shape === 2) {
          ctx.beginPath();
          ctx.rect(-l.radius / 2, l.center - l.radius / 2, l.radius, l.radius);
        } else triangle(ctx, l.center, l.radius, l.up);
        ctx.fill();
        ctx.stroke();
        rotate(ctx, 360 / l.sides);
      }
      return;
    case 'hexagons':
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.weight;
      rotate(ctx, 360 / l.sides / 2);
      for (let k = 1; k < l.steps + 1; k++) {
        hexagon(ctx, l.offset + k * l.step * 0.8);
        ctx.stroke();
      }
      return;
  }
}

function step(ctx: CanvasRenderingContext2D, s: State, i: number): void {
  if (i === 0) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
  }
  const op = s.ops[i];
  ctx.save();
  ctx.translate(op.crystal.x, op.crystal.y);
  ctx.scale(s.scale, s.scale);
  drawLayer(ctx, op.layer);
  ctx.restore();
}

const piece: PieceDefinition<State, P> = {
  slug: 'crystals',
  version: 1,
  title: 'Crystals',
  description: 'A grid of layered, radially symmetric crystals (2019 sketch).',
  aspect: ASPECT,
  schema,
  featured: [
    // Defaults: 3 columns, 3 sides, orange and blue, seed c1.
    'eyJ2IjoxLCJzIjoiYzEiLCJwIjp7ImNvbHVtbnMiOjMsInNpZGVzIjozLCJtaW5MYXllcnMiOjIsIm1heExheWVycyI6NCwicGFsZXR0ZSI6WyIjZjU1NTNlIiwiIzY4OGE5NCJdLCJiYWNrZ3JvdW5kIjoiIzMxMjcyZCJ9fQ',
    // 5 columns, 6 sides, seed c2.
    'eyJ2IjoxLCJzIjoiYzIiLCJwIjp7ImNvbHVtbnMiOjUsInNpZGVzIjo2LCJtaW5MYXllcnMiOjIsIm1heExheWVycyI6NCwicGFsZXR0ZSI6WyIjZjU1NTNlIiwiIzY4OGE5NCJdLCJiYWNrZ3JvdW5kIjoiIzMxMjcyZCJ9fQ',
    // Peppermint on charcoal, 4 columns, 8 sides, seed pep.
    'eyJ2IjoxLCJzIjoicGVwIiwicCI6eyJjb2x1bW5zIjo0LCJzaWRlcyI6OCwibWluTGF5ZXJzIjoyLCJtYXhMYXllcnMiOjQsInBhbGV0dGUiOlsiIzE3ZDI5NyIsIiM5NmI3YjUiLCIjZGNkY2RjIiwiIzIwMjU0MyJdLCJiYWNrZ3JvdW5kIjoiIzE5MTkxOSJ9fQ',
  ],
  snapshotCodes: [
    // min/max layers swapped (5 and 1), 2 sides, 1 column, seed snapswap.
    'eyJ2IjoxLCJzIjoic25hcHN3YXAiLCJwIjp7ImNvbHVtbnMiOjEsInNpZGVzIjoyLCJtaW5MYXllcnMiOjUsIm1heExheWVycyI6MSwicGFsZXR0ZSI6WyIjZjU1NTNlIiwiIzY4OGE5NCJdLCJiYWNrZ3JvdW5kIjoiIzMxMjcyZCJ9fQ',
    // Mid-build stop step n=10, defaults, seed snapmid.
    'eyJ2IjoxLCJzIjoic25hcG1pZCIsInAiOnsiY29sdW1ucyI6Mywic2lkZXMiOjMsIm1pbkxheWVycyI6MiwibWF4TGF5ZXJzIjo0LCJwYWxldHRlIjpbIiNmNTU1M2UiLCIjNjg4YTk0Il0sImJhY2tncm91bmQiOiIjMzEyNzJkIn0sIm4iOjEwfQ',
  ],
  setup,
  step: (ctx, state, i) => step(ctx, state, i),
  steps: (state) => state.ops.length,
};

export default piece;
