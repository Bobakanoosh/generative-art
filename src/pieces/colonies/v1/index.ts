/**
 * colonies v1 - ported from the 2019 p5.js "Paint Splatter" sketch (this
 * piece was published as Paint Splatter, slug paint-splatter, which now
 * redirects here; the rename changed no drawing).
 *
 * Points are dropped one at a time inside a disc (or a square). Each new
 * point looks for its nearest neighbour: the closer it is, the likelier it
 * snaps next to that neighbour and joins its colour group; otherwise it starts
 * a new group with a fresh colour. Every time a group gains a point, all of
 * its points swell a little, so old members of big groups end up largest.
 * The simulation runs in setup (in the sketch's original 900-unit space); the
 * build then draws the points in the order they were placed.
 *
 * FROZEN once deployed: changing behaviour here changes every share code.
 */
import { TAU, cos, pow, sin } from '@/lib/art/math';
import { rgba } from '@/lib/art/color';
import type { Rng } from '@/lib/art/rng';
import { defineSchema, type ParamsOf, type PieceDefinition } from '@/lib/piece/types';

const ASPECT = 1;
const W = 1000;
const H = W / ASPECT;
/** The sketch's canvas was 900 px; the simulation keeps its units. */
const SRC = 900;
const K = W / SRC;
const DISC_RADIUS = 350;
const SQUARE_MARGIN = 100;
const BASE_RADIUS = 0.05;
const TARGET_STEPS = 300;
const CELL = 12; // nearest-neighbour grid cell, in source units

const PALETTES: string[][] = [
  ['#f5553e', '#688a94', '#c03221', '#545e75'],
  ['#17d297', '#202543', '#dcdcdc', '#96b7b5'],
  ['#82ff8a', '#ff6161'],
  ['#e9c46a', '#f4a261', '#e76f51', '#2a9d8f'],
];

const schema = defineSchema({
  points: {
    kind: 'integer', default: 30000, min: 2000, max: 40000,
    label: 'Points', group: 'Growth',
  },
  attraction: {
    kind: 'number', default: 25, min: 1, max: 120, step: 1,
    label: 'Attraction', description: 'Higher joins more points to existing groups: fewer, bigger splatters.', group: 'Growth',
  },
  jitter: {
    kind: 'number', default: 4, min: 1, max: 12, step: 0.5,
    label: 'Jitter', description: 'How far a joining point lands from its neighbour.', group: 'Growth',
  },
  growth: {
    kind: 'number', default: 0.05, min: 0.01, max: 0.2, step: 0.005,
    label: 'Swell', description: 'How much a group\'s points grow each time it gains one.', group: 'Growth',
  },
  shape: { kind: 'select', default: 'circle', options: ['circle', 'square'], label: 'Shape', group: 'Layout' },
  centerBias: {
    kind: 'number', default: 0, min: 0, max: 1, step: 0.05,
    label: 'Center bias', description: 'Crowds points toward the middle of the disc.', group: 'Layout',
  },
  opacity: {
    kind: 'number', default: 0.27, min: 0.05, max: 1, step: 0.01,
    label: 'Opacity', group: 'Style',
  },
  outline: { kind: 'boolean', default: true, label: 'Outline', description: 'Thin dark rim around each point.', group: 'Style' },
  colorMode: {
    kind: 'select', default: 'earth', options: ['earth', 'palette'],
    label: 'Colors', description: 'Earth: the sketch\'s random muted tones. Palette: groups pick from the palette.', group: 'Color',
  },
  palette: {
    kind: 'palette', default: PALETTES[0], minColors: 1, maxColors: 8, presets: PALETTES,
    label: 'Palette', group: 'Color',
  },
  background: { kind: 'color', default: '#000000', label: 'Background', group: 'Color' },
});
type P = ParamsOf<typeof schema>;

interface State {
  xs: Float64Array; // logical units
  ys: Float64Array;
  rs: Float64Array; // diameter, logical units
  colors: string[]; // per group
  group: Int32Array;
  perStep: number;
  steps: number;
  outline: boolean;
  outlineColor: string;
  background: string;
}

const hex2 = (v: number) => {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return (n < 16 ? '0' : '') + n.toString(16);
};

/**
 * Exact nearest-neighbour search over points added by index, using a uniform
 * grid of `cell`-sized buckets covering [0, extent] (points outside clamp into
 * the edge buckets). Ties go to the lowest index, like a linear scan.
 */
export function createNearestGrid(xs: ArrayLike<number>, ys: ArrayLike<number>, extent: number, cell: number) {
  const gw = Math.ceil(extent / cell) + 2;
  const cells: number[][] = Array.from({ length: gw * gw }, () => []);
  const cellOf = (v: number) => Math.max(0, Math.min(gw - 1, Math.floor(v / cell) + 1));
  return {
    add(i: number) {
      cells[cellOf(ys[i]) * gw + cellOf(xs[i])].push(i);
    },
    /** Index of the nearest added point (-1 if none) and its distance. */
    nearest(x: number, y: number) {
      const cx = cellOf(x);
      const cy = cellOf(y);
      let best = -1;
      let bestD = Infinity;
      for (let ring = 0; ring < gw; ring++) {
        // Every point in ring r or beyond is at least (r - 1) cells away.
        const minAway = (ring - 1) * cell;
        if (best >= 0 && minAway > 0 && minAway * minAway > bestD) break;
        for (let gy = cy - ring; gy <= cy + ring; gy++) {
          if (gy < 0 || gy >= gw) continue;
          const edgeRow = gy === cy - ring || gy === cy + ring;
          const stride = edgeRow || ring === 0 ? 1 : 2 * ring;
          for (let gx = cx - ring; gx <= cx + ring; gx += stride) {
            if (gx < 0 || gx >= gw) continue;
            for (const j of cells[gy * gw + gx]) {
              const dx = xs[j] - x;
              const dy = ys[j] - y;
              const d = dx * dx + dy * dy;
              if (d < bestD || (d === bestD && j < best)) {
                bestD = d;
                best = j;
              }
            }
          }
        }
      }
      return { j: best, d: Math.sqrt(bestD) };
    },
  };
}

function setup(params: P, rng: Rng): State {
  const n = params.points;
  const attraction = params.attraction;
  const jitter = params.jitter;
  const growth = params.growth;
  const square = params.shape === 'square';
  const exponent = 0.5 + 0.5 * params.centerBias;
  const usePalette = params.colorMode === 'palette';
  const palette = params.palette;
  const opacity = params.opacity;

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const added = new Int32Array(n); // group size when the point joined
  const group = new Int32Array(n);
  const groupSize: number[] = [];
  const colors: string[] = [];

  const newGroup = () => {
    const c = usePalette
      ? palette[rng.int(0, palette.length)]
      : `#${hex2(rng.range(30, 240))}${hex2(rng.range(80, 130))}${hex2(95)}`;
    colors.push(rgba(c, opacity));
    groupSize.push(0);
    return colors.length - 1;
  };

  const grid = createNearestGrid(xs, ys, SRC, CELL);

  for (let i = 0; i < n; i++) {
    let x: number;
    let y: number;
    if (square) {
      x = rng.range(SQUARE_MARGIN, SRC - SQUARE_MARGIN);
      y = rng.range(SQUARE_MARGIN, SRC - SQUARE_MARGIN);
    } else {
      const a = rng.next() * TAU;
      const r = DISC_RADIUS * pow(rng.next(), exponent);
      x = SRC / 2 + r * cos(a);
      y = SRC / 2 + r * sin(a);
    }
    let g: number;
    if (i === 0) {
      g = newGroup();
    } else {
      const { j, d } = grid.nearest(x, y);
      if (rng.range(1, d) <= attraction) {
        x = rng.range(xs[j] - jitter, xs[j] + jitter);
        y = rng.range(ys[j] - jitter, ys[j] + jitter);
        g = group[j];
      } else {
        g = newGroup();
      }
    }
    xs[i] = x;
    ys[i] = y;
    group[i] = g;
    groupSize[g]++;
    added[i] = groupSize[g];
    grid.add(i);
  }

  // A point swells once for itself and once for every later member of its
  // group, so its final size is known once every point is placed.
  const rs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    rs[i] = (BASE_RADIUS + growth * (groupSize[group[i]] - added[i] + 1)) * K;
    xs[i] *= K;
    ys[i] *= K;
  }

  const perStep = Math.max(1, Math.ceil(n / TARGET_STEPS));
  return {
    xs, ys, rs, colors, group,
    perStep,
    steps: Math.ceil(n / perStep),
    outline: params.outline,
    outlineColor: '#000000',
    background: params.background,
  };
}

function step(ctx: CanvasRenderingContext2D, s: State, i: number): void {
  if (i === 0) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = s.outlineColor;
    ctx.lineWidth = K;
  }
  const end = Math.min(s.xs.length, (i + 1) * s.perStep);
  for (let p = i * s.perStep; p < end; p++) {
    ctx.fillStyle = s.colors[s.group[p]];
    ctx.beginPath();
    ctx.arc(s.xs[p], s.ys[p], s.rs[p] / 2, 0, TAU);
    ctx.fill();
    if (s.outline) ctx.stroke();
  }
}

const piece: PieceDefinition<State, P> = {
  slug: 'colonies',
  version: 1,
  title: 'Colonies',
  description: 'Translucent dots clump into colour groups by nearest-neighbour attraction (2019 sketch).',
  aspect: ASPECT,
  schema,
  featured: [
    // Artist's pick (main preview): 40 000 points, strong attraction, earth tones on black, seed a1.
    'eyJ2IjoxLCJzIjoiYTEiLCJwIjp7InBvaW50cyI6NDAwMDAsImF0dHJhY3Rpb24iOjk5LCJqaXR0ZXIiOjQuNSwiZ3Jvd3RoIjowLjA1LCJzaGFwZSI6ImNpcmNsZSIsImNlbnRlckJpYXMiOjAsIm9wYWNpdHkiOjAuMzUsIm91dGxpbmUiOnRydWUsImNvbG9yTW9kZSI6ImVhcnRoIiwicGFsZXR0ZSI6WyIjZTljNDZhIiwiI2Y0YTI2MSIsIiNlNzZmNTEiLCIjMmE5ZDhmIl0sImJhY2tncm91bmQiOiIjMDAwMDAwIn19',
    // Artist's pick: centre-biased opaque blooms, mint/navy/grey palette on deep indigo, seed 2eu7bvfyeb.
    'eyJ2IjoxLCJzIjoiMmV1N2J2ZnllYiIsInAiOnsicG9pbnRzIjo0MDAwMCwiYXR0cmFjdGlvbiI6MTQsImppdHRlciI6OC41LCJncm93dGgiOjAuMiwic2hhcGUiOiJjaXJjbGUiLCJjZW50ZXJCaWFzIjoxLCJvcGFjaXR5IjoxLCJvdXRsaW5lIjp0cnVlLCJjb2xvck1vZGUiOiJwYWxldHRlIiwicGFsZXR0ZSI6WyIjMTdkMjk3IiwiIzIwMjU0MyIsIiNkY2RjZGMiLCIjOTZiN2I1Il0sImJhY2tncm91bmQiOiIjMWIxOTI5In19',
    // Square, palette colours, seed sq1.
    'eyJ2IjoxLCJzIjoic3ExIiwicCI6eyJwb2ludHMiOjMwMDAwLCJhdHRyYWN0aW9uIjo0MCwiaml0dGVyIjo0LCJncm93dGgiOjAuMDMsInNoYXBlIjoic3F1YXJlIiwiY2VudGVyQmlhcyI6MCwib3BhY2l0eSI6MC41NSwib3V0bGluZSI6dHJ1ZSwiY29sb3JNb2RlIjoicGFsZXR0ZSIsInBhbGV0dGUiOlsiI2U5YzQ2YSIsIiNmNGEyNjEiLCIjZTc2ZjUxIiwiIzJhOWQ4ZiJdLCJiYWNrZ3JvdW5kIjoiIzBkMGQwZCJ9fQ',
  ],
  snapshotCodes: [
    // Former featured codes, kept pinned.
    // Even disc, earth tones, defaults, seed a1.
    'eyJ2IjoxLCJzIjoiYTEiLCJwIjp7InBvaW50cyI6MzAwMDAsImF0dHJhY3Rpb24iOjI1LCJqaXR0ZXIiOjQsImdyb3d0aCI6MC4wNSwic2hhcGUiOiJjaXJjbGUiLCJjZW50ZXJCaWFzIjowLCJvcGFjaXR5IjowLjI3LCJvdXRsaW5lIjp0cnVlLCJjb2xvck1vZGUiOiJlYXJ0aCIsInBhbGV0dGUiOlsiI2Y1NTUzZSIsIiM2ODhhOTQiLCIjYzAzMjIxIiwiIzU0NWU3NSJdLCJiYWNrZ3JvdW5kIjoiIzAwMDAwMCJ9fQ',
    // Dendrites: centre bias, strong attraction, opaque, seed a6.
    'eyJ2IjoxLCJzIjoiYTYiLCJwIjp7InBvaW50cyI6OTAwMCwiYXR0cmFjdGlvbiI6MTIwLCJqaXR0ZXIiOjIuNSwiZ3Jvd3RoIjowLjAxMiwic2hhcGUiOiJjaXJjbGUiLCJjZW50ZXJCaWFzIjowLjYsIm9wYWNpdHkiOjEsIm91dGxpbmUiOnRydWUsImNvbG9yTW9kZSI6ImVhcnRoIiwicGFsZXR0ZSI6WyIjZjU1NTNlIiwiIzY4OGE5NCIsIiNjMDMyMjEiLCIjNTQ1ZTc1Il0sImJhY2tncm91bmQiOiIjMDAwMDAwIn19',
    // outline off, defaults, seed snapnoline.
    'eyJ2IjoxLCJzIjoic25hcG5vbGluZSIsInAiOnsicG9pbnRzIjozMDAwMCwiYXR0cmFjdGlvbiI6MjUsImppdHRlciI6NCwiZ3Jvd3RoIjowLjA1LCJzaGFwZSI6ImNpcmNsZSIsImNlbnRlckJpYXMiOjAsIm9wYWNpdHkiOjAuMjcsIm91dGxpbmUiOmZhbHNlLCJjb2xvck1vZGUiOiJlYXJ0aCIsInBhbGV0dGUiOlsiI2Y1NTUzZSIsIiM2ODhhOTQiLCIjYzAzMjIxIiwiIzU0NWU3NSJdLCJiYWNrZ3JvdW5kIjoiIzAwMDAwMCJ9fQ',
    // Mid-build stop step n=100, defaults, seed snapmid.
    'eyJ2IjoxLCJzIjoic25hcG1pZCIsInAiOnsicG9pbnRzIjozMDAwMCwiYXR0cmFjdGlvbiI6MjUsImppdHRlciI6NCwiZ3Jvd3RoIjowLjA1LCJzaGFwZSI6ImNpcmNsZSIsImNlbnRlckJpYXMiOjAsIm9wYWNpdHkiOjAuMjcsIm91dGxpbmUiOnRydWUsImNvbG9yTW9kZSI6ImVhcnRoIiwicGFsZXR0ZSI6WyIjZjU1NTNlIiwiIzY4OGE5NCIsIiNjMDMyMjEiLCIjNTQ1ZTc1Il0sImJhY2tncm91bmQiOiIjMDAwMDAwIn0sIm4iOjEwMH0',
  ],
  setup,
  step: (ctx, state, i) => step(ctx, state, i),
  steps: (state) => state.steps,
};

export default piece;
