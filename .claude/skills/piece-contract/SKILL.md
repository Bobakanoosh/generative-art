---
name: piece-contract
description: The PieceDefinition interface every generative piece implements - logical coordinates, steps vs time, param schema kinds, accumulation rules. Use when writing or reviewing a piece, asking what setup/step/steps do, "piece interface", "param schema", "logical coordinates", "DT", "accumulates", "featured", or "how does a piece render".
---

# Piece contract

A piece is the default export of a `PieceDefinition<State, P>` (`src/lib/piece/types.ts`) at `src/pieces/<slug>/v<N>/index.ts`. **Reference implementation: `src/pieces/flow-ribbons/v1/index.ts`** - read it before writing a new one.

```ts
import type { Rng } from '@/lib/art/rng';
import { defineSchema, type ParamsOf, type PieceDefinition } from '@/lib/piece/types';

const schema = defineSchema({ /* see Params below */ });
type P = ParamsOf<typeof schema>;

interface State { /* everything step() needs, built in setup() */ }

const piece: PieceDefinition<State, P> = {
  slug: 'my-piece',          // kebab-case, same as the folder name
  version: 1,                // same as the v<N> folder
  title: 'My Piece',
  description: 'One line.',
  aspect: 4 / 5,             // width / height, fixed per piece
  schema,                    // from defineSchema, see below
  featured: [],              // share codes: gallery tiles, thumbnails, snapshots
  snapshotCodes: [],         // optional: extra share codes that are only snapshot-tested
  local: true,               // hidden in production until removed
  setup(params: P, rng: Rng): State { /* ... */ },
  step(ctx, state, i, input) { /* draw step i */ },
  steps: (state) => state.totalSteps,
};
export default piece;
```

Optional fields: `interactive`, `accumulates`, `loopSteps`, `phases` (`{ at, label }[]`, shown as ticks on the player's scrub bar), `description`.

## Coordinates
Draw in **logical units**: the width is always 1000 (`LOGICAL_WIDTH`), the height is `1000 / aspect`. The runner sets the canvas transform (scales to the output width, or to a print tile), so never read `canvas.width` or scale by pixel size yourself. Define `const W = 1000, H = W / ASPECT` and use those.

## Steps, not time
The runner calls `setup(params, rng)` once, then `step(ctx, state, i, input)` for `i = 0 .. steps(state) - 1`. There is no wall clock. One step is one fixed tick, `DT = 1/60` s (both `DT` and `LOGICAL_WIDTH` are exported from `@/lib/render/runner`); for seconds use `i * DT`. What a step does may depend only on `state` and `i`.
- Paint the background in `step` when `i === 0`.
- A share code may carry `n` (stop step), so the runner must be able to stop at any step and give the same image the server would.
- Kinds: **build** (finite `steps`). **Endless** (`steps` = `Infinity`): runs live at 60 steps/s until `MAX_STOP_STEP`; every share code needs `n`, so featured codes for endless pieces must carry `n`. **Interactive** (`interactive: true`): `input` is live data, see below. Reference: `src/pieces/murmuration/v1` (endless and interactive).

### Input (`InputFrame`)
`input: { pointer: { x, y, down } | null; keys: string[] }` is what the visitor did **at step `i`**: `pointer` is the latest pointer state (`null` = no pointer, e.g. left the canvas) in logical units, `down` is button/touch pressed; `keys` are key presses that landed on exactly that step (a key appears once, not while held). Pointer coordinates are **quantized**: `x = qx / 10` with integer `qx`, so server replays match the browser exactly. Treat `input` as the only source of interaction; never read DOM events. The input log (`InputLog`) is replayed through `createRunner(..., input)`; a non-interactive piece ignores it.

### `loopSteps`
Optional: the step count after which the piece repeats seamlessly, used for seamless live video loops. Must be a positive multiple of 4 (video frames are every 2 steps for MP4, every 4 for GIF); `tests/loopSteps.test.ts` enforces it.

### Pacing and phases
The player paces a build to about 10 s at 1x whatever its step count (eased, slow start, faster finish), so `steps` should reflect visual progression: each step should add a visible increment, and avoid one giant step that does most of the drawing. `phases[].at` is a step index; the player draws a labelled tick at `at / steps` on the scrub bar. Pacing is viewer-only and never changes the final image.

## Accumulation, no pixel feedback
Pieces draw onto the existing canvas each step; translucent strokes accumulate. Set `accumulates: true` when the look of step N depends on pixels from earlier steps. **Never read pixels back** (`getImageData` is lint-banned and platform dependent). Keep any history you need in `state` and redraw from it.

## Params
`ParamSchema = Record<string, ParamSpec & { label, description?, group?, randomize? }>`. `setup` (and `fastForward`) receive params already validated (clamped, defaulted, unknown keys dropped). Declare the schema with `defineSchema({...})` (not a `: ParamSchema` annotation, which erases the literal types) and type params as `ParamsOf<typeof schema>`: each key gets its value type, so no casts (`params.count`, not `params.count as number`). Value types: `number`/`integer` -> `number`, `boolean` -> `boolean`, `color` -> `string`, `palette` -> `string[]`, `select` -> union of its options, `multiselect` -> array of that union.

| kind | fields |
|---|---|
| `number` | `default, min, max, step?` |
| `integer` | `default, min, max` |
| `boolean` | `default` |
| `color` | `default: '#rrggbb'` |
| `palette` | `default: string[], minColors?, maxColors?, presets?: string[][]` |
| `select` | `default, options: readonly string[]` |
| `multiselect` | `default: string[], options, minSelected?` |

```ts
const schema = defineSchema({
  count: { kind: 'integer', default: 500, min: 50, max: 3000, label: 'Count', group: 'Flow' },
  scale: { kind: 'number', default: 1.5, min: 0.3, max: 6, step: 0.05, label: 'Scale' },
  palette: { kind: 'palette', default: ['#e9c46a', '#264653'], minColors: 2, maxColors: 8, presets: PALETTES, label: 'Palette' },
  mode: { kind: 'select', default: 'lines', options: ['lines', 'dots'], label: 'Mode' },
});
type P = ParamsOf<typeof schema>; // { count: number; scale: number; palette: string[]; mode: 'lines' | 'dots' }
```
`randomize: false` keeps a param out of the Randomize button. Param keys, ranges, and defaults are part of the frozen contract once deployed (share codes store them).

## Rules
- All randomness comes from the `rng` given to `setup` (see `seeded-randomness-and-determinism`).
- Import only from `@/lib/art/*` (`math`, `noise`, `color`, `rng`) and `@/lib/piece/types`.
- Keep everything in `State`; no module-level mutable state (two renders in one process must not interfere).
- Once deployed a version is frozen (see `new-version`).
- `featured` must be non-empty (tests assert it). `snapshotCodes` is optional: codes that are never shown but are hashed alongside `featured` by `tests/snapshots.test.ts`; use them to cover modes and params the featured codes don't (each `select` option, flipped booleans, a mid-build `n`).
