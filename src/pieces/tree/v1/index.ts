/**
 * tree v1 - ported from the 2019 p5.js "Tree" sketch.
 *
 * A root ring in the middle sends out branches; each branch is a line to a
 * smaller child ring, which branches again with fewer arms until a ring with
 * no arms ends that limb. Every child works in its parent's rotated frame, so
 * the turns compound down the tree. Generations alternate between the two
 * palette colours. The sketch drew on a 2000-unit canvas; the geometry keeps
 * those units; by default the whole tree is fitted to the frame, otherwise it
 * keeps the sketch's scale around the root. `zoom` scales either view.
 *
 * FROZEN once deployed: changing behaviour here changes every share code.
 */
import { PI, cos, sin } from '@/lib/art/math';
import type { Rng } from '@/lib/art/rng';
import type { ParamSchema, Params, PieceDefinition } from '@/lib/piece/types';

const ASPECT = 1;
const W = 1000;
const H = W / ASPECT;
const SRC = 2000;
const DEG = PI / 180;
const MAX_NODES = 4000;

const PALETTES: string[][] = [
  ['#f5553e', '#688a94'],
  ['#82ff8a', '#ff6161'],
  ['#c03221', '#545e75'],
  ['#17d297', '#96b7b5'],
];

const schema: ParamSchema = {
  branches: {
    kind: 'integer', default: 4, min: 1, max: 7,
    label: 'Branches', description: 'Arms on the root ring; each child has fewer.', group: 'Growth',
  },
  minDist: {
    kind: 'integer', default: 100, min: 0, max: 400,
    label: 'Min reach', group: 'Growth',
  },
  maxDist: {
    kind: 'integer', default: 300, min: 20, max: 600,
    label: 'Max reach', group: 'Growth',
  },
  margin: {
    kind: 'integer', default: 45, min: 0, max: 45,
    label: 'Margin', description: 'Higher keeps branches apart; 45 fixes each arm\'s angle.', group: 'Angles',
  },
  restrict: {
    kind: 'integer', default: 180, min: 0, max: 360,
    label: 'Spread', description: 'Degrees the arms of one ring fan across.', group: 'Angles',
  },
  rootRadius: {
    kind: 'integer', default: 70, min: 10, max: 200,
    label: 'Root size', group: 'Rings',
  },
  shrink: {
    kind: 'integer', default: 30, min: 0, max: 80,
    label: 'Shrink', description: 'Up to how much smaller each child ring is.', group: 'Rings',
  },
  weight: {
    kind: 'number', default: 5, min: 1, max: 16, step: 0.5,
    label: 'Line weight', group: 'Style',
  },
  fit: {
    kind: 'boolean', default: true,
    label: 'Fit to frame', description: 'Centre and scale the whole tree; off keeps the original fixed scale around the root.', group: 'Style',
  },
  zoom: {
    kind: 'number', default: 1, min: 0.3, max: 2, step: 0.05,
    label: 'Zoom', group: 'Style',
  },
  palette: {
    kind: 'palette', default: PALETTES[0], minColors: 2, maxColors: 2, presets: PALETTES,
    label: 'Palette', group: 'Color',
  },
  background: { kind: 'color', default: '#31272d', label: 'Background', group: 'Color' },
};

type Op =
  | { kind: 'ring'; x: number; y: number; d: number; color: string }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number; color: string };

interface State {
  ops: Op[];
  weight: number;
  /** Source space -> logical space: scale, then offset. */
  k: number;
  tx: number;
  ty: number;
  background: string;
}

const FIT_PAD = 60; // logical units around a fitted tree

interface Frame { ox: number; oy: number; a: number } // origin and rotation (radians)

const toWorld = (f: Frame, x: number, y: number) => ({
  x: f.ox + x * cos(f.a) - y * sin(f.a),
  y: f.oy + x * sin(f.a) + y * cos(f.a),
});

function setup(params: Params, rng: Rng): State {
  const minDist = Math.min(params.minDist as number, params.maxDist as number);
  const maxDist = Math.max(params.minDist as number, params.maxDist as number);
  const margin = params.margin as number;
  const restrictAdj = (params.restrict as number) / 4;
  const shrink = params.shrink as number;
  const [c0, c1] = params.palette as string[];
  const ops: Op[] = [];
  let nodes = 0;

  // Mirrors the sketch's recursive Node.render: ring, then per arm a line and
  // the child (drawn depth first, so a limb finishes before its sibling).
  const grow = (frame: Frame, x: number, y: number, radius: number, branches: number, generation: number) => {
    nodes++;
    const color = generation % 2 === 0 ? c0 : c1;
    const at = toWorld(frame, x, y);
    ops.push({ kind: 'ring', x: at.x, y: at.y, d: radius, color });
    for (let k = 0; k < branches; k++) {
      const degree = rng.range(margin + restrictAdj * k, 90 - margin + restrictAdj * k);
      const distance = rng.range(minDist, maxDist);
      const adj = radius / 2;
      const childRadius = Math.trunc(rng.range(radius - shrink, radius));
      // The sketch's translate(x, y) + rotate(degree) inside the parent frame.
      const local: Frame = { ox: at.x, oy: at.y, a: frame.a + degree * DEG };
      const p0 = toWorld(local, adj, adj);
      const end = distance + childRadius / 2;
      const p1 = toWorld(local, end, end);
      ops.push({ kind: 'line', x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, color });
      const childBranches = Math.trunc(rng.range(0, branches));
      if (nodes < MAX_NODES) {
        grow(local, distance + adj, distance + adj, childRadius, childBranches, generation + 1);
      }
    }
  };
  grow({ ox: SRC / 2, oy: SRC / 2, a: 0 }, 0, 0, params.rootRadius as number, params.branches as number, 1);

  const weight = params.weight as number;
  const zoom = params.zoom as number;
  // Source-space point that lands in the middle of the frame, and its scale.
  let cx = SRC / 2;
  let cy = SRC / 2;
  let k = (W / SRC) * zoom;
  if (params.fit as boolean) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x: number, y: number, r: number) => {
      x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r);
      y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
    };
    for (const op of ops) {
      if (op.kind === 'ring') add(op.x, op.y, Math.abs(op.d) / 2 + weight / 2);
      else {
        add(op.x0, op.y0, weight / 2);
        add(op.x1, op.y1, weight / 2);
      }
    }
    const span = Math.max(x1 - x0, y1 - y0, 1);
    cx = (x0 + x1) / 2;
    cy = (y0 + y1) / 2;
    k = ((W - 2 * FIT_PAD) / span) * zoom;
  }
  return {
    ops,
    weight,
    k,
    tx: W / 2 - cx * k,
    ty: H / 2 - cy * k,
    background: params.background as string,
  };
}

function step(ctx: CanvasRenderingContext2D, s: State, i: number): void {
  if (i === 0) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, W, H);
  }
  const op = s.ops[i];
  ctx.save();
  ctx.translate(s.tx, s.ty);
  ctx.scale(s.k, s.k);
  ctx.lineWidth = s.weight;
  ctx.lineCap = 'round';
  ctx.strokeStyle = op.color;
  ctx.beginPath();
  if (op.kind === 'ring') ctx.arc(op.x, op.y, Math.abs(op.d) / 2, 0, 2 * PI);
  else {
    ctx.moveTo(op.x0, op.y0);
    ctx.lineTo(op.x1, op.y1);
  }
  ctx.stroke();
  ctx.restore();
}

const piece: PieceDefinition<State> = {
  slug: 'tree',
  version: 1,
  title: 'Tree',
  description: 'Rings branching into smaller rings, turning as they go (2019 sketch).',
  aspect: ASPECT,
  schema,
  featured: [
    // Defaults, fitted, seed t1.
    'eyJ2IjoxLCJzIjoidDEiLCJwIjp7ImJyYW5jaGVzIjo0LCJtaW5EaXN0IjoxMDAsIm1heERpc3QiOjMwMCwibWFyZ2luIjo0NSwicmVzdHJpY3QiOjE4MCwicm9vdFJhZGl1cyI6NzAsInNocmluayI6MzAsIndlaWdodCI6NSwiZml0Ijp0cnVlLCJ6b29tIjoxLCJwYWxldHRlIjpbIiNmNTU1M2UiLCIjNjg4YTk0Il0sImJhY2tncm91bmQiOiIjMzEyNzJkIn19',
    // 6 branches, wide spread, seed t3.
    'eyJ2IjoxLCJzIjoidDMiLCJwIjp7ImJyYW5jaGVzIjo2LCJtaW5EaXN0IjoxMDAsIm1heERpc3QiOjMwMCwibWFyZ2luIjozMCwicmVzdHJpY3QiOjMwMCwicm9vdFJhZGl1cyI6NzAsInNocmluayI6MzAsIndlaWdodCI6MywiZml0Ijp0cnVlLCJ6b29tIjoxLCJwYWxldHRlIjpbIiNmNTU1M2UiLCIjNjg4YTk0Il0sImJhY2tncm91bmQiOiIjMzEyNzJkIn19',
    // Green and red on grey, long reach, seed ggr.
    'eyJ2IjoxLCJzIjoiZ2dyIiwicCI6eyJicmFuY2hlcyI6NSwibWluRGlzdCI6NjAsIm1heERpc3QiOjQwMCwibWFyZ2luIjoxMCwicmVzdHJpY3QiOjEyMCwicm9vdFJhZGl1cyI6NzAsInNocmluayI6MzAsIndlaWdodCI6NCwiZml0Ijp0cnVlLCJ6b29tIjoxLCJwYWxldHRlIjpbIiM4MmZmOGEiLCIjZmY2MTYxIl0sImJhY2tncm91bmQiOiIjMjMyMzIzIn19',
  ],
  snapshotCodes: [
    // fit off (sketch scale around the root), defaults, seed snapnofit.
    'eyJ2IjoxLCJzIjoic25hcG5vZml0IiwicCI6eyJicmFuY2hlcyI6NCwibWluRGlzdCI6MTAwLCJtYXhEaXN0IjozMDAsIm1hcmdpbiI6NDUsInJlc3RyaWN0IjoxODAsInJvb3RSYWRpdXMiOjcwLCJzaHJpbmsiOjMwLCJ3ZWlnaHQiOjUsImZpdCI6ZmFsc2UsInpvb20iOjEsInBhbGV0dGUiOlsiI2Y1NTUzZSIsIiM2ODhhOTQiXSwiYmFja2dyb3VuZCI6IiMzMTI3MmQifX0',
    // Mid-build stop step n=12, defaults, seed snapmid.
    'eyJ2IjoxLCJzIjoic25hcG1pZCIsInAiOnsiYnJhbmNoZXMiOjQsIm1pbkRpc3QiOjEwMCwibWF4RGlzdCI6MzAwLCJtYXJnaW4iOjQ1LCJyZXN0cmljdCI6MTgwLCJyb290UmFkaXVzIjo3MCwic2hyaW5rIjozMCwid2VpZ2h0Ijo1LCJmaXQiOnRydWUsInpvb20iOjEsInBhbGV0dGUiOlsiI2Y1NTUzZSIsIiM2ODhhOTQiXSwiYmFja2dyb3VuZCI6IiMzMTI3MmQifSwibiI6MTJ9',
  ],
  setup,
  step: (ctx, state, i) => step(ctx, state, i),
  steps: (state) => state.ops.length,
};

export default piece;
