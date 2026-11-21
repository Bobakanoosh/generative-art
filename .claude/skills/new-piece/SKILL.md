---
name: new-piece
description: Step-by-step to create a brand-new generative piece (v1) - scaffold the file, register it, iterate in dev, pick featured share codes, generate thumbnails and snapshots. Use when the artist says "new piece", "start a piece", "add a piece", "create artwork", or "scaffold a piece".
---

# New piece

Read `piece-contract` and `seeded-randomness-and-determinism` first. Reference: `src/pieces/flow-ribbons/v1/index.ts`. Never commit without the artist's explicit permission.

## 1. Scaffold `src/pieces/<slug>/v1/index.ts`
`<slug>` is kebab-case. Start with `local: true` and no featured codes yet (production hides local pieces):

```ts
import type { Rng } from '@/lib/art/rng';
import type { ParamSchema, Params, PieceDefinition } from '@/lib/piece/types';

const ASPECT = 1;
const W = 1000;
const H = W / ASPECT;

const schema: ParamSchema = {
  count: { kind: 'integer', default: 200, min: 10, max: 1000, label: 'Count' },
  background: { kind: 'color', default: '#101218', label: 'Background' },
};

interface State { xs: number[]; ys: number[]; background: string }

function setup(params: Params, rng: Rng): State {
  const count = params.count as number;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < count; k++) {
    xs.push(rng.range(0, W));
    ys.push(rng.range(0, H));
  }
  return { xs, ys, background: params.background as string };
}

const piece: PieceDefinition<State> = {
  slug: 'my-piece',
  version: 1,
  title: 'My Piece',
  aspect: ASPECT,
  schema,
  featured: [],
  local: true,
  setup,
  step(ctx, s, i) {
    if (i === 0) {
      ctx.fillStyle = s.background;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.xs[i] - 1, s.ys[i] - 1, 2, 2);
  },
  steps: (s) => s.xs.length,
};
export default piece;
```

## 2. Register it in `src/pieces/index.ts`
```ts
import myPieceV1 from './my-piece/v1';
const PIECES = [flowRibbonsV1, myPieceV1] as PieceDefinition[];
```
Always import registry functions from `@/pieces`, never from `@/lib/piece/registry`, so registration runs.

## 3. Iterate
`npm run dev`, open `http://localhost:3000/art/<slug>` (local pieces are visible in dev). The panel has Regenerate (new seed), Randomize (new seed + random params), Reset, and Copy link. Use the player bar to watch the build; pick Instant speed for fast tweaks. Keep `npm run lint` clean as you go - it blocks banned APIs.

## 4. Choose featured codes
`npm test` fails while a registered piece has an empty `featured` (the snapshot test asserts `featured.length > 0`): add at least one code (even a provisional one) before running tests or recording snapshots.

Pick 3 or so strong, varied results. In the panel use **Copy link** and take the `g=` value (the share code); paste each into `featured: [...]`, with a comment of what it is. Codes must have `v` equal to `version`. **Endless pieces** (`steps` = `Infinity`): every featured and snapshot code must include `n` (the stop step to render, at most `MAX_STOP_STEP`), e.g. `encodeGeneration({ v: 1, s: 'seed', p, n: 1800 })`; in the live view use Capture or note the step to choose `n`. Programmatic alternative: `encodeGeneration({ v: 1, s: 'seed', p: { ...defaultsOf(schema), ... } })` from `@/lib/piece/share` and `@/lib/piece/schema`. Include **every** param in `p` (missing ones are defaulted with an issue; use full params so the code is stable).

## 5. Snapshots and thumbnails
Optionally add `snapshotCodes: [...]` (same format, never shown) to pin params or modes the featured codes don't exercise, e.g. each `select` option, booleans flipped, a mid-build `n`. Featured and snapshot codes need recorded hashes in `src/pieces/<slug>/v1/snapshots.json`:
- bash: `UPDATE_SNAPSHOTS=1 npm test`
- PowerShell: `$env:UPDATE_SNAPSHOTS=1; npm test` (then `Remove-Item Env:UPDATE_SNAPSHOTS`)

Then `npm test` must pass without the variable. Thumbnails: `npm run thumbs` (renders `public/thumbs/`; it also runs on `prebuild`, but `next dev` does not, so run it to see gallery tiles in dev).

## 6. Interactive pieces
Set `interactive: true` and drive behaviour only from `input` (see `piece-contract`). Test in the browser: drag, press keys, leave the canvas, and touch; then click Capture and open the `/c/<id>` link to confirm the replay matches what you saw. Unit-test `step` with hand-built `InputFrame`s and a synthetic `InputLog` through `replaySource`. Run `npm run test:engines` to confirm every JS engine agrees (it covers interactive pieces with a fixed synthetic input log).

## 7. Check the video export
Before publishing a build piece, click Record video (and GIF) on its page and watch the result: the build should read well over 8 s and the 2 s hold should show the finished image. For endless pieces, record a 5 s clip from the live view instead; if the piece loops, declare `loopSteps` (a multiple of 4) and try the seamless loop option.

## 8. Done iterating?
Follow `publish-piece`. Until then keep `local: true`.
