---
name: seeded-randomness-and-determinism
description: How to keep generative pieces deterministic - banned APIs (Math.random, Math.sin, Date, getImageData), the seeded rng and deterministic math helpers, noise usage, pitfalls. Use for "random", "randomness", "seed", "deterministic", "noise", "flow field", "Math.sin lint error", "reproducible", "snapshot hash changed", or any piece that must render identically every time.
---

# Seeded randomness and determinism

## Why
A share code (`/art/<slug>?g=<code>`, base64url of `{ v, s, p, n? }`) must reproduce the same image forever and everywhere: in the browser, in the server renderer (`/api/render`, the canonical source for OG images, downloads, prints, thumbnails), and years from now. Snapshot tests hash server renders. So output may depend **only** on piece version, seed `s`, params `p`, and stop step `n`.

## Banned inside `src/pieces/**` (enforced by `npm run lint`)
| Banned | Use instead |
|---|---|
| `Math.random()` | the `rng` passed to `setup` |
| `Math.sin cos tan asin acos atan atan2 sinh cosh tanh exp expm1 log log1p log2 log10 pow cbrt hypot` (engines may differ in the last bit) | `sin cos tan atan atan2 exp log pow hypot` from `@/lib/art/math` |
| `Date`, `performance.now()` | the step index `i` (`i * DT` for seconds) |
| `crypto` (any use) | the `rng` passed to `setup` |
| the above via `globalThis.` / `window.` / `self.` / `global.` (e.g. `globalThis.Math.sin`) | same as above |
| `getImageData` | keep history in `state` |

Allowed natives: `Math.sqrt abs floor ceil round trunc min max sign fround imul PI`. Also avoid other platform-dependent things: text and fonts, `Intl`, locale-aware sorting, `ctx.measureText`, canvas filters, shadow blur.

**Text:** `fillText`, `strokeText` and `measureText` depend on the fonts installed where the render runs (the server renderer, each visitor's browser, a CI box), so the same code can draw different pixels on different machines. Avoid text in pieces; if a piece truly needs it, embed the font (register a bundled font file for both the server canvas and the browser) and treat the font file as part of the frozen version.

Helpers in `@/lib/art/math`: constants `PI TAU HALF_PI`; `sin cos tan atan atan2 exp log pow hypot`; `lerp clamp map smoothstep`. Colour helpers in `@/lib/art/color`: `hexToRgb rgba oklch mixHex`.

## rng cheat-sheet (`setup(params, rng)` receives it, seeded from `s`)
```ts
rng.next()                  // [0, 1)
rng.range(min, max)         // [min, max)
rng.int(min, maxExclusive)  // upper bound EXCLUSIVE
rng.bool(p = 0.5)
rng.pick(items)             // throws on an empty array
rng.shuffle(items)          // new array, input untouched
rng.gaussian(mean?, sd?)
rng.weighted([[item, weight], ...])
```
The rng is one stream: **the order and count of calls matters**. Adding or removing a single call changes everything drawn after it. Draw randomness in `setup` and keep it in `state`; do not call `rng` inside `step` unless the sequence is fixed by `i`.

## Noise
```ts
import { createNoise2D, createNoise3D } from '@/lib/art/noise';
const n = createNoise2D(rng);       // consumes the rng once (permutation table)
const v = n(x * f, y * f);          // simplex, in [-1, 1]
const detail = createNoise2D(rng);  // a second, independent field
const n3 = createNoise3D(rng);      // n3(x, y, i * rate) evolves with the step index
```
Create noise in `setup`, store the function in `state`. Scale by `freq / 1000` (logical units) so the look is resolution independent. See `makeField` in `src/pieces/flow-ribbons/v1/index.ts` for a curl-of-noise flow field.

## Pitfalls
- Deterministic and fine: object key order, `Map`/`Set` iteration (insertion order), `Array.prototype.sort` with a consistent comparator. Never sort with a random comparator.
- Never feed `Date`, `Math.random`, `crypto`, window size, or devicePixelRatio into a piece.
- Do not compute constants with banned `Math.*` at module load.
- Floating-point summation order matters; do not reorder loops in a deployed version.
- **Cross-engine:** output must match in every JS engine (a visitor's Safari/Firefox simulation must equal the server's Node render of a captured moment). `npm run test:engines` bundles `src/lib/determinism/probe.ts` and compares draw-call hashes for every piece in Node, WebKit and Firefox; run it after any piece or `src/lib/art` change (first time: `npx playwright install webkit firefox`). A mismatch usually means a banned or engine-dependent `Math.*` call, reordered float summation, or iteration-order reliance. Never "fix" it by editing a deployed version.
- Frozen along with the pieces (changing any of these changes existing share codes): `src/lib/art/*` (including the sfc32 counter order in `rng.ts`), the runner (except its additive optional `input` parameter), `validateParams` in `src/lib/piece/schema.ts`, and the share-code decode rules in `src/lib/piece/share.ts`.
- Changing behaviour changes every share code for that version: make a new version (`new-version`). A toolkit change in `src/lib/art/*` that alters any output must be a **new function name** (for example `noise2b`), never an edit, because frozen versions still call the old one.
- `npm test` renders every featured code and compares hashes with `snapshots.json`, and renders each twice to prove it is byte-identical.
