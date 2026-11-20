# Plan 1 — Foundation: contract, toolkit, server render, piece page, gallery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working site where a visitor opens the gallery, clicks a flow-field piece, tweaks its config, regenerates, copies a share link that reproduces the image exactly, downloads the canonical PNG, and the link unfurls with that exact image.

**Architecture:** Next.js App Router app at the repo root. Pieces are deterministic step machines (`setup` / `step` / `steps`) drawing in a 1000-unit logical space on Canvas 2D. A single runner drives pieces in the browser and in Node (`@napi-rs/canvas`, the canonical renderer). Share codes are base64url JSON. A Node API route renders PNGs for downloads and Open Graph images.

**Tech Stack:** Next.js (latest, App Router, TypeScript, `src/` dir), React, Tailwind CSS v4, Vitest, ESLint (flat config), `@napi-rs/canvas` (exact pinned version), `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-11-19-generative-art-portfolio-design.md`

## Global Constraints

- **NEVER run `git commit`, `git add`, or any command that creates commits.** The artist has not given permission. Every "Checkpoint" step means: stop, confirm tests pass, leave changes uncommitted.
- Logical drawing space: 1000 units wide, `1000 / aspect` tall. Fixed timestep `dt = 1/60`.
- Inside `src/pieces/**`: no `Math.random`, no transcendental `Math.*` (`sin cos tan asin acos atan atan2 sinh cosh tanh exp expm1 log log1p log2 log10 pow cbrt hypot`), no `Date`, no `performance`, no `getImageData`. Allowed: `Math.sqrt abs floor ceil round trunc min max sign fround imul PI`.
- `@napi-rs/canvas` installed with an exact version (`--save-exact`); it is the canonical renderer.
- Piece code lives at `src/pieces/<slug>/v<N>/`; a deployed version is frozen.
- Share URL: `/art/<slug>?g=<code>`; `code` = base64url (no padding) of JSON `{ v, s, p, n? }`.
- Public render width cap: 4096 px; default 1200 px.
- Each piece has a fixed `aspect` (width / height).
- Site chrome: art-first, minimal, dark-friendly. Functional styling only in this plan; a design pass comes later.

## Review Focus

1. **Tampered or malformed `g` codes** (bad base64, non-JSON, wrong types, out-of-range numbers, unknown version) — page renders defaults with a visible notice; API returns 400. Never a crash or 500. → tests in Task 3 and Task 7.
2. **Same code rendered twice, or at two widths** — identical image (same hash at same width; same composition at different widths). → tests in Task 5 and Task 6.
3. **Absurd API widths** (`w=0`, `w=-5`, `w=999999`, `w=abc`) — clamped to [16, 4096] or default; no OOM. → test in Task 7.
4. **Unknown slug / unknown version** — 404 page; API 404. → tests in Task 4 and Task 7.
5. **Window resize / high-DPI** — browser canvas re-renders at container width × devicePixelRatio, same composition. → covered by runner transform test in Task 5 (composition is width-independent); manual check in Task 9.

---

## File Structure

```
src/
  lib/art/
    math.ts            deterministic transcendental math + lerp/clamp/map
    rng.ts             seed hashing + seeded PRNG with helpers
    noise.ts           seeded 2D/3D simplex noise
    color.ts           hex/rgba/oklch → canvas color strings
  lib/piece/
    types.ts           PieceDefinition, ParamSchema, ParamSpec, InputFrame, Generation
    schema.ts          defaults, validation, randomization
    share.ts           encode/decode generation codes, newSeed
    registry.ts        all piece versions, lookup, production filtering
  lib/render/
    runner.ts          createRunner / renderGeneration (env-agnostic)
    server.ts          renderPng via @napi-rs/canvas
  pieces/
    index.ts           imports every piece version into the registry
    flow-ribbons/v1/
      index.ts         the starter build piece
      snapshots.json   canonical pixel hashes
  app/
    page.tsx           gallery
    art/[slug]/page.tsx        piece page (server) + metadata
    art/[slug]/ArtView.tsx     client canvas + panel
    art/[slug]/ParamPanel.tsx  schema-driven controls
    api/render/route.ts        PNG endpoint
scripts/
  render-thumbnails.ts
tests/
  (co-located *.test.ts next to sources; snapshot + lint tests in tests/)
.claude/skills/
  piece-contract/SKILL.md
  seeded-randomness-and-determinism/SKILL.md
  new-piece/SKILL.md
  publish-piece/SKILL.md
  new-version/SKILL.md
```

---

### Task 1: Scaffold the app and test tooling

**Files:**
- Create: Next.js app at repo root (via `create-next-app`), `vitest.config.ts`, `tests/smoke.test.ts`
- Modify: `package.json` scripts

**Interfaces:**
- Produces: `npm test` (vitest run), `npm run lint`, `npm run dev`, `npm run build`; path alias `@/*` → `src/*`.

- [ ] **Step 1: Scaffold.** The repo already contains `docs/`; scaffold into a temp dir and move files in, or run in place if `create-next-app` accepts the non-empty dir:
  `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack-prompt` (answer prompts to match: TypeScript, Tailwind, ESLint, App Router, `src/`).
- [ ] **Step 2: Install dev/test deps:** `npm i -D vitest tsx` and `npm i --save-exact @napi-rs/canvas`.
- [ ] **Step 3: Add `vitest.config.ts`** with `environment: 'node'`, the `@` alias resolved to `./src`, `include: ['src/**/*.test.ts', 'tests/**/*.test.ts']`. Add script `"test": "vitest run"`.
- [ ] **Step 4: Write `tests/smoke.test.ts`:** `expect(1 + 1).toBe(2)`.
- [ ] **Step 5: Verify:** `npm test` → 1 passed. `npm run build` → succeeds.
- [ ] **Step 6: Checkpoint** (no commit).

---

### Task 2: Art toolkit — deterministic math, rng, noise, color

**Files:**
- Create: `src/lib/art/math.ts`, `src/lib/art/rng.ts`, `src/lib/art/noise.ts`, `src/lib/art/color.ts`
- Test: `src/lib/art/math.test.ts`, `src/lib/art/rng.test.ts`, `src/lib/art/noise.test.ts`, `src/lib/art/color.test.ts`

**Interfaces:**
- Produces:
  - `math.ts`: `PI, TAU, HALF_PI`; `sin(x)`, `cos(x)`, `tan(x)`, `atan(x)`, `atan2(y, x)`, `exp(x)`, `log(x)`, `pow(x, y)`, `hypot(x, y)`, `lerp(a, b, t)`, `clamp(x, lo, hi)`, `map(x, inLo, inHi, outLo, outHi)`, `smoothstep(e0, e1, x)` — all `number`.
  - `rng.ts`: `hashSeed(seed: string): [number, number, number, number]`; `createRng(seed: string): Rng` where
    ```ts
    interface Rng {
      next(): number;                       // [0, 1)
      range(min: number, max: number): number;
      int(min: number, maxExclusive: number): number;
      bool(p?: number): boolean;            // default 0.5
      pick<T>(items: readonly T[]): T;
      shuffle<T>(items: readonly T[]): T[]; // returns new array
      gaussian(mean?: number, sd?: number): number;
      weighted<T>(items: readonly (readonly [T, number])[]): T;
    }
    ```
  - `noise.ts`: `createNoise2D(rng: Rng): (x: number, y: number) => number`, `createNoise3D(rng: Rng): (x, y, z) => number`, outputs in [-1, 1].
  - `color.ts`: `hexToRgb(hex: string): [number, number, number]` (accepts `#rgb`/`#rrggbb`), `rgba(hex: string, alpha: number): string` → `"rgba(r, g, b, a)"`, `oklch(l: number, c: number, h: number, alpha?: number): string` (h in degrees; returns `rgba(...)` string, gamut-clipped), `mixHex(a: string, b: string, t: number): string`.

- [ ] **Step 1: Write failing tests.**
  - `math.test.ts`: for 10,000 evenly spaced `x` in [-1000, 1000]: `|sin(x) - Math.sin(x)| < 1e-12`, same for `cos`; `tan` within `1e-9` relative where `|cos(x)| > 1e-3`. `atan2` over a grid of (y, x) in [-10, 10]² including axes and `(0, 0) → 0`: within `1e-12` of `Math.atan2`. `exp` on [-700, 700]: relative error `< 1e-12`. `log` on `[1e-300, 1e300]` (log-spaced): absolute error `< 1e-12`; `log(0) === -Infinity`; `Number.isNaN(log(-1))`. `pow`: relative `< 1e-11` for x in [0.01, 100], y in [-10, 10]; `pow(-2, 3) === -8`; `pow(0, 2) === 0`; `pow(x, 0) === 1`. `hypot(3, 4) === 5`.
  - `rng.test.ts`: two `createRng('abc')` produce identical first 1000 `next()` values; `'abc'` vs `'abd'` differ; first three values of `createRng('seed')` match a hard-coded array (record it once implementation exists, then freeze — this pins the algorithm forever); `int(0, 10)` over 10,000 draws covers 0–9 and never 10; `shuffle` returns a permutation; `weighted([['a', 0], ['b', 1]])` always `'b'`; mean of 20,000 `gaussian()` within 0.05 of 0.
  - `noise.test.ts`: same rng seed → same values; 10,000 samples all within [-1, 1]; values at points 0.001 apart differ by < 0.01 (continuity).
  - `color.test.ts`: `hexToRgb('#f80') ` → `[255, 136, 0]`; `rgba('#000000', 0.5)` → `'rgba(0, 0, 0, 0.5)'`; `oklch(1, 0, 0)` → `'rgba(255, 255, 255, 1)'`; `oklch(0, 0, 0)` → `'rgba(0, 0, 0, 1)'`; `mixHex('#000000', '#ffffff', 0.5)` → `'#808080'`.
- [ ] **Step 2: Run** `npm test` → new tests FAIL (modules missing).
- [ ] **Step 3: Implement `math.ts`** using only `+ - * /`, `Math.floor/abs/sqrt`, and bit-level float construction (via `Float64Array`/`DataView`). Approach:
  - `sin/cos`: Cody–Waite range reduction by π/2 (split π/2 into 3 constants), then odd/even Taylor–Horner polynomials on [-π/4, π/4] to degree ≥ 17 / 16, select by quadrant.
  - `atan`: reduce `|x| > 1` via `π/2 − atan(1/x)`, then `x > 2−√3` via `π/6 + atan((√3·x − 1)/(√3 + x))`, then Taylor series; `atan2` from `atan` with quadrant handling.
  - `exp`: `x = k·ln2 + r` (ln2 split hi/lo), Horner polynomial for `e^r`, scale by `2^k` built from exponent bits (split into two factors when k is outside [-1022, 1023]).
  - `log`: extract exponent `e` and mantissa `m ∈ [√½, √2)` from bits; `log(m) = 2·atanh(s)`, `s = (m−1)/(m+1)`, odd series; plus `e·ln2`.
  - `pow(x, y)`: special cases (y=0, x=0, x<0 with integer y → sign × pow(|x|, y), x<0 non-integer y → NaN), else `exp(y·log(x))`.
  - `hypot`: `Math.sqrt(x*x + y*y)` with scaling to avoid overflow.
- [ ] **Step 4: Implement `rng.ts`** — `hashSeed` = cyrb128 string hash; generator = sfc32 seeded from the four words, warmed up with 15 discarded draws. `gaussian` = Box–Muller using `log`, `cos` from `math.ts`.
- [ ] **Step 5: Implement `noise.ts`** — standard simplex (2D and 3D) with a 256-entry permutation table built by `rng.shuffle`. Arithmetic + `Math.floor` only.
- [ ] **Step 6: Implement `color.ts`** — OKLCH → OKLab → linear sRGB → gamma sRGB (cube via multiplication; gamma `pow` from `math.ts`), clamp to [0, 255], round.
- [ ] **Step 7: Run** `npm test` → all PASS. Then fill in the frozen first-three-values array in `rng.test.ts` from actual output and re-run → PASS.
- [ ] **Step 8: Checkpoint** (no commit).

---

### Task 3: Piece types, schema, and share codes

**Files:**
- Create: `src/lib/piece/types.ts`, `src/lib/piece/schema.ts`, `src/lib/piece/share.ts`
- Test: `src/lib/piece/schema.test.ts`, `src/lib/piece/share.test.ts`

**Interfaces:**
- Consumes: `Rng` from `@/lib/art/rng`.
- Produces (`types.ts`):
  ```ts
  type ParamSpec =
    | { kind: 'number'; default: number; min: number; max: number; step?: number }
    | { kind: 'integer'; default: number; min: number; max: number }
    | { kind: 'boolean'; default: boolean }
    | { kind: 'color'; default: string }                       // '#rrggbb'
    | { kind: 'palette'; default: string[]; minColors?: number; maxColors?: number; presets?: string[][] }
    | { kind: 'select'; default: string; options: readonly string[] }
    | { kind: 'multiselect'; default: string[]; options: readonly string[]; minSelected?: number };
  type ParamMeta = { label: string; description?: string; group?: string; randomize?: boolean }; // randomize default true
  type ParamSchema = Record<string, ParamSpec & ParamMeta>;
  type Params = Record<string, unknown>;
  interface InputFrame { pointer: { x: number; y: number; down: boolean } | null; keys: string[] } // logical coords
  interface Generation { v: number; s: string; p: Params; n?: number }
  interface PieceDefinition<S = unknown> {
    slug: string; version: number; title: string; description?: string;
    aspect: number; schema: ParamSchema;
    interactive?: boolean; accumulates?: boolean; loopSteps?: number;
    phases?: { at: number; label: string }[];
    featured: string[];        // share codes
    local?: boolean;           // excluded from production
    setup(params: Params, rng: Rng): S;
    step(ctx: CanvasRenderingContext2D, state: S, i: number, input: InputFrame): void;
    steps(state: S): number;
  }
  const EMPTY_INPUT: InputFrame;   // { pointer: null, keys: [] }
  ```
- Produces (`schema.ts`): `defaultsOf(schema): Params`; `validateParams(schema, raw: unknown): { params: Params; issues: string[] }`; `randomizeParams(schema, rng, current: Params): Params`.
- Produces (`share.ts`): `encodeGeneration(g: Generation): string`; `decodeGeneration(code: string): Generation | null`; `newSeed(): string` (10 chars `[a-z0-9]`, uses `crypto.getRandomValues`).

- [ ] **Step 1: Write failing tests.**
  - `schema.test.ts` (with a fixture schema covering every kind): `defaultsOf` returns each default; `validateParams` with valid input → same params, `issues: []`; number above max → clamped to max with one issue; integer `3.7` → `4` with issue; wrong type (`'abc'` for number) → default with issue; missing key → default with issue; unknown extra key → dropped with issue; `select` value not in options → default; `multiselect` with unknown option → filtered, below `minSelected` → default; palette with invalid hex → default; `raw` not an object → all defaults, one issue. `randomizeParams` with fixed rng: deterministic; values within bounds; params with `randomize: false` keep `current` value.
  - `share.test.ts`: round-trip `{v:1, s:'abc123', p:{a:1, b:'x', c:[1,2]}}` and with `n: 600`; output matches `/^[A-Za-z0-9_-]+$/`; `decodeGeneration('!!!')`, `'e30'` (`{}`), base64url of `'[1]'`, of `{"v":"1","s":"a","p":{}}`, and of non-JSON → `null`; `newSeed()` matches `/^[a-z0-9]{10}$/` and two calls differ.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `types.ts`, `schema.ts`, `share.ts`. `decodeGeneration` checks shape only (`v` positive integer, `s` non-empty string ≤ 64 chars, `p` plain object, `n` absent or non-negative integer); schema validation is the caller's job. Use `TextEncoder`/`btoa`-free base64url that works in both Node and browser (`Buffer` is not available client-side).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Checkpoint** (no commit).

---

### Task 4: Registry and lint guard for pieces

**Files:**
- Create: `src/lib/piece/registry.ts`, `src/pieces/index.ts`, `tests/piece-lint.test.ts`
- Modify: `eslint.config.mjs`
- Test: `src/lib/piece/registry.test.ts`

**Interfaces:**
- Consumes: `PieceDefinition`.
- Produces: `registerPieces(defs: PieceDefinition[]): void` (internal); `getPiece(slug: string, version?: number): PieceDefinition | undefined` (latest when version omitted); `latestVersion(slug): number | undefined`; `listPieces(): PieceDefinition[]` (latest version of each slug, excluding `local` pieces when `process.env.NODE_ENV === 'production'`); `allVersions(): PieceDefinition[]` (including local). `src/pieces/index.ts` imports each piece version and calls `registerPieces`; app code imports registry functions via `@/pieces` (which re-exports them) so registration always happens.

- [ ] **Step 1: Write failing tests.**
  - `registry.test.ts` with two fake definitions (`demo` v1 and v2): `getPiece('demo')?.version === 2`; `getPiece('demo', 1)?.version === 1`; `getPiece('nope') === undefined`; `getPiece('demo', 9) === undefined`; `listPieces()` returns one entry for `demo`; a `local: true` piece is excluded when `NODE_ENV` is stubbed to `'production'` and included otherwise; registering a duplicate slug+version throws.
  - `tests/piece-lint.test.ts`: uses the ESLint `ESLint` class with `lintText(code, { filePath: 'src/pieces/x/v1/index.ts' })`. Each of `Math.random()`, `Math.sin(1)`, `Math.pow(2,2)`, `Date.now()`, `new Date()`, `performance.now()`, `ctx.getImageData(0,0,1,1)` → ≥ 1 error. `Math.sqrt(2)`, `Math.floor(1.5)` → 0 errors. Same banned code at `filePath: 'src/lib/x.ts'` → 0 errors from these rules.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** registry; add an ESLint flat-config block with `files: ['src/pieces/**/*.ts']` using `no-restricted-properties` (Math.* list from Global Constraints, `performance.now`), `no-restricted-globals` (`Date`, `performance`), and `no-restricted-syntax` for `CallExpression[callee.property.name='getImageData']`, each with a message pointing to `@/lib/art/math` or `@/lib/art/rng`.
- [ ] **Step 4: Run** `npm test` and `npm run lint` → PASS.
- [ ] **Step 5: Checkpoint** (no commit).

---

### Task 5: Runner (shared by browser and server)

**Files:**
- Create: `src/lib/render/runner.ts`
- Test: `src/lib/render/runner.test.ts`

**Interfaces:**
- Consumes: `PieceDefinition`, `Generation`, `validateParams`, `createRng`, `EMPTY_INPUT`.
- Produces:
  ```ts
  const LOGICAL_WIDTH = 1000;
  const DT = 1 / 60;
  interface Tile { x: number; y: number; w: number; h: number }      // logical units
  interface Runner {
    readonly total: number;           // stop step count (finite)
    readonly index: number;           // steps completed
    readonly done: boolean;
    advance(n: number): void;         // run up to n more steps
    finish(): void;
  }
  function logicalHeight(piece: PieceDefinition): number;           // 1000 / aspect
  function createRunner(piece, gen: Generation, ctx: CanvasRenderingContext2D,
                        outWidthPx: number, tile?: Tile): Runner;
  function renderGeneration(piece, gen, ctx, outWidthPx, tile?): void; // createRunner(...).finish()
  ```
  `createRunner` validates `gen.p` with `validateParams`, seeds `createRng(gen.s)`, calls `setup`, clears the canvas, sets the transform `scale(outWidthPx / tileW)` then `translate(-tile.x, -tile.y)` (tile defaults to the full logical area), and resets that transform before every `step` (pieces may change it). `total = gen.n ?? piece.steps(state)`; if not finite, throw `Error('Endless piece requires a stop step')` (Plan 3 replaces this).

- [ ] **Step 1: Write failing tests** using a recording fake ctx (records `setTransform`/`fillRect` calls) and a fake piece (`steps → 5`, `step` draws `fillRect(i*10, 0, 10, 10)`):
  - `renderGeneration` calls `step` with i = 0..4 in order; setup receives validated params and an rng whose first `next()` equals `createRng(gen.s).next()`.
  - Transform at width 500 is `scale 0.5`; at width 2000 is `scale 2` (composition width-independent).
  - Tile `{x: 500, y: 0, w: 500, h: 625}` at 1000 px → scale 2, translate -500.
  - `gen.n = 3` → only 3 steps run. `advance(2)` then `advance(10)` → index 5, `done`.
  - Fake piece with `steps → Infinity` and no `n` → throws.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `runner.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Checkpoint** (no commit).

---

### Task 6: Starter piece `flow-ribbons` v1 and server renderer

**Files:**
- Create: `src/pieces/flow-ribbons/v1/index.ts`, `src/lib/render/server.ts`, `tests/snapshots.test.ts`, `src/pieces/flow-ribbons/v1/snapshots.json`
- Modify: `src/pieces/index.ts`

**Interfaces:**
- Consumes: toolkit (Task 2), types (Task 3), runner (Task 5).
- Produces: `renderPng(piece: PieceDefinition, gen: Generation, widthPx: number): Promise<Buffer>` (height = round(width / aspect)); piece `flow-ribbons` v1.

Piece spec (builder designs the look within this):
- `aspect: 4 / 5`; build piece (`steps` finite).
- Schema: `particles` integer 200–6000 default 1800; `length` integer 50–800 default 320 (= `steps`); `noiseScale` number 0.3–6 default 1.6 step 0.05; `turbulence` number 0–3 default 0.8; `lineWidth` number 0.2–4 default 0.9; `alpha` number 0.01–0.6 default 0.1; `palette` palette default 5 harmonious colors with ≥ 2 presets; `background` color default dark; `mode` select `['lines', 'dots']` default `'lines'`; `fadeIn` boolean default true.
- Step 0 fills the background; every step advances every particle along a noise-derived angle (via `sin`/`cos` from toolkit) and draws its segment with `alpha` — transparency accumulates.
- `featured`: 3 codes chosen by the builder that look good (the artist will replace them).

- [ ] **Step 1: Write failing test `tests/snapshots.test.ts`:** for every version in `allVersions()` and every code in its `featured`: decode, `renderPng(piece, gen, 400)`, sha256 hex; compare with `src/pieces/<slug>/v<N>/snapshots.json` (`{ [code]: hash }`). When `UPDATE_SNAPSHOTS=1`, write the file instead of asserting. Also: rendering the same code twice yields the same hash.
- [ ] **Step 2: Run** `npm test` → FAIL (no piece / no renderer).
- [ ] **Step 3: Implement** `server.ts` (`createCanvas` from `@napi-rs/canvas`, `renderGeneration`, `canvas.encode('png')`), the piece, and register it in `src/pieces/index.ts`.
- [ ] **Step 4: Render the featured codes** to `tmp/` with a quick `tsx` one-liner and look at them; adjust the piece until it looks good. Then `UPDATE_SNAPSHOTS=1 npm test`, then `npm test` → PASS. `npm run lint` → 0 errors.
- [ ] **Step 5: Checkpoint** (no commit). Show the artist the rendered PNGs.

---

### Task 7: Render API route

**Files:**
- Create: `src/app/api/render/route.ts`, `src/lib/render/parseRenderRequest.ts`
- Test: `src/lib/render/parseRenderRequest.test.ts`

**Interfaces:**
- Consumes: registry, `decodeGeneration`, `renderPng`.
- Produces: `GET /api/render?slug=<slug>&g=<code>&w=<px>` → `image/png`, `Cache-Control: public, max-age=31536000, immutable`; route exports `runtime = 'nodejs'`. Pure helper `parseRenderRequest(params: URLSearchParams): { ok: true; piece; gen; width } | { ok: false; status: 400 | 404; error: string }`.

- [ ] **Step 1: Write failing tests** for `parseRenderRequest`: valid → ok with width 1200 when `w` absent; `w=0`, `w=-5`, `w=abc` → 1200; `w=999999` → 4096; `w=10` → 16; missing `slug` → 400; unknown slug → 404; missing/garbage `g` → 400; `g` with version that doesn't exist → 404; `g` with out-of-range params → ok (renderer validates/clamps).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** helper and route (returns `new Response(pngBuffer, …)`; errors as JSON with the status).
- [ ] **Step 4: Run** tests → PASS. `npm run dev`, open `/api/render?slug=flow-ribbons&g=<featured code>` → image; `?slug=nope&g=x` → 404 JSON.
- [ ] **Step 5: Checkpoint** (no commit).

---

### Task 8: Piece page — canvas, schema panel, share links, metadata

**Files:**
- Create: `src/app/art/[slug]/page.tsx`, `src/app/art/[slug]/ArtView.tsx`, `src/app/art/[slug]/ParamPanel.tsx`, `src/app/art/[slug]/not-found.tsx`, `src/lib/piece/useGeneration.ts`
- Test: `src/lib/piece/generationState.test.ts`, `src/lib/piece/generationState.ts`

**Interfaces:**
- Consumes: registry, schema, share, runner.
- Produces: pure reducer `generationReducer(state: { gen: Generation; issues: string[] }, action): state` in `generationState.ts`, with actions `{type:'regenerate', seed}`, `{type:'randomize', seed, rng}`, `{type:'reset', seed}`, `{type:'setParam', key, value}`; `initialGeneration(piece, code: string | null, seed: string): { gen; issues }` (null/invalid/foreign-version code → defaults + issue `'Invalid link — showing defaults'`; version mismatch with an existing older version is allowed and kept).

Behavior:
- `page.tsx` (server): `params: Promise<{slug}>`, `searchParams: Promise<{g?: string}>`; unknown slug → `notFound()`. Picks the version from the decoded code if that version exists, else latest. `generateMetadata` sets title/description and `openGraph.images` / `twitter.images` to `/api/render?slug=…&g=…&w=1200` (absolute URL via `metadataBase` from `NEXT_PUBLIC_SITE_URL`, default `http://localhost:3000`); with no `g`, uses the first featured code.
- `ArtView.tsx` (client): canvas sized to container width × `devicePixelRatio`, fixed aspect; re-renders with `renderGeneration` on generation change and on resize (debounced 150 ms). Plan 1 renders instantly; playback arrives in Plan 2.
- `ParamPanel.tsx`: one control per schema entry, grouped by `group` — number/integer → range slider + numeric input; boolean → toggle; color → `<input type="color">`; palette → swatches each with color input, add/remove within min/max, preset buttons; select → segmented/radio; multiselect → checkboxes.
- Actions: Regenerate (new seed, `pushState`), Randomize (`pushState`), Reset (`pushState`), Copy link (clipboard, brief "Copied"), Download PNG (link to `/api/render?...&w=4096`). Param changes → `replaceState` debounced 250 ms. `popstate` restores the generation from the URL.
- Notices: `issues` non-empty → small dismissible notice above the art. Viewing an older version → "A newer version of this piece exists" with a link to the latest.

- [ ] **Step 1: Write failing tests** for `generationReducer` / `initialGeneration`: regenerate changes only `s`; randomize changes `s` and only randomizable params; reset restores defaults; setParam validates (out-of-range clamps); `initialGeneration` with null → defaults, no issues; with garbage → defaults + the issue string; with a valid featured code → that generation.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** reducer, then the page, view, panel, and hook.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run lint` and `npm run build` → succeed.
- [ ] **Step 5: Manual verify in `npm run dev`:** `/art/flow-ribbons` renders; slider changes update image and URL; Copy link → open in new tab → identical image; `?g=garbage` → defaults + notice; `/art/nope` → 404; resizing the window keeps the composition; view page source shows `og:image` pointing at `/api/render`.
- [ ] **Step 6: Checkpoint** (no commit).

---

### Task 9: Gallery and thumbnail script

**Files:**
- Create: `scripts/render-thumbnails.ts`; Modify: `src/app/page.tsx`, `package.json` (script `"thumbs": "tsx scripts/render-thumbnails.ts"`)
- Test: `src/lib/piece/thumbnails.test.ts`, `src/lib/piece/thumbnails.ts`

**Interfaces:**
- Consumes: registry, `renderPng`.
- Produces: `thumbnailPath(slug: string, version: number, code: string): string` → `/thumbs/<slug>-v<version>-<first 12 chars of sha256(code)>.png`; `galleryItems(): { slug; title; code; thumb: string; href: string }[]` — one entry per featured code of each listed piece (builder's call per spec; one tile per featured item).

- [ ] **Step 1: Write failing tests:** `thumbnailPath` is stable and URL-safe; `galleryItems()` returns one item per featured code with `href === '/art/<slug>?g=<code>'`; local pieces excluded under production `NODE_ENV`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** helpers; script renders each item at 800 px wide into `public/thumbs/` (skips existing files unless `--force`); gallery page shows a responsive grid of `next/image` tiles (fixed aspect per piece, title on hover/focus), linking to `href`.
- [ ] **Step 4: Run** `npm run thumbs`, `npm test`, `npm run build` → succeed. Manual: `/` shows 3 tiles; clicking one opens the piece page with that exact image; check at a phone-width viewport.
- [ ] **Step 5: Checkpoint** (no commit).

---

### Task 10: Initial skills

**Files:**
- Create: `.claude/skills/piece-contract/SKILL.md`, `.claude/skills/seeded-randomness-and-determinism/SKILL.md`, `.claude/skills/new-piece/SKILL.md`, `.claude/skills/publish-piece/SKILL.md`, `.claude/skills/new-version/SKILL.md`, `CLAUDE.md`

Each `SKILL.md` has frontmatter `name` and a `description` that says when to use it (trigger phrases like "new piece", "publish", "flow field", "random", "deterministic").

- `piece-contract`: the `PieceDefinition` interface, logical coordinates, steps vs time (`DT`), build/endless/interactive kinds, `accumulates`, no pixel feedback, schema kinds with an example, pointer to `src/pieces/flow-ribbons/v1` as reference.
- `seeded-randomness-and-determinism`: why (share codes, prints, server canonical), the banned list and replacements, rng helper cheat-sheet, noise usage, common pitfalls (iteration order of object keys is fine; `Array.prototype.sort` with a comparator is deterministic; no `Set` of floats tricks needed; never use time).
- `new-piece`: steps — create `src/pieces/<slug>/v1/index.ts` with `local: true`, register, iterate with `npm run dev`, choose featured codes from the panel, render thumbnails, snapshots.
- `publish-piece`: checklist — remove `local`, `npm run lint`, `UPDATE_SNAPSHOTS=1 npm test` then `npm test`, `npm run thumbs`, `npm run build`; after deploy the version is frozen.
- `new-version`: copy `v<N>` → `v<N+1>`, bump `version`, register both, never edit the old folder, new snapshots; toolkit changes that alter output need a new function name.
- `CLAUDE.md`: project overview, commands, the no-commit-without-permission rule, pointers to the spec and skills.

- [ ] **Step 1: Write the files.**
- [ ] **Step 2: Verify:** follow `new-piece` literally to scaffold a throwaway `local: true` piece `scratch`, confirm it appears in dev and not in `NODE_ENV=production npm run build` output listing, then delete it. `npm test`, `npm run lint` → PASS.
- [ ] **Step 3: Checkpoint** (no commit). Report to the artist.

---

## Later plans (outline — each gets its own detailed plan when we reach it)

**Plan 2 — Playback, video, print.** Animated builds via `createRunner().advance()` on `requestAnimationFrame` with ~10 s eased pacing; player bar (play/pause/replay/speed/skip/progress/phase ticks); instant-while-dragging, replay-on-release. Frame-locked recording to MP4 (WebCodecs + muxer) with WebM fallback, GIF secondary; 8 s + 2 s hold at 1080 px. Print route `/art/<slug>/print` with paper sizes, 300 DPI tiled rendering, caption, `window.print()`.

**Plan 3 — Endless and interactive pieces, captures.** `steps → Infinity` support in runner (requires `n`), real-time 60 steps/s loop that slows instead of skipping; input recording (logical pointer + keys per step) and replay; Capture button → `n`-only generation links or stored captures (`/c/<id>`) via Vercel Blob with size/step caps, per-IP rate limiting, validation; capture render endpoint + OG metadata; endless clip and seamless loop recording; cross-engine determinism test (simulation state hash in a real browser engine vs Node); second starter piece (endless interactive particles).

**Plan 4 — Design pass and deploy.** Visual design of gallery, piece page, panel, player (frontend-design / impeccable skills), including the artist's 2026-11-20 requests: gallery shows one grouped set per piece (primary + two follow-ups, exactly 3 featured), and clean, art-site-quality config controls with an independently scrolling panel; Vercel deploy with `NEXT_PUBLIC_SITE_URL`; first technique skill (`flow-fields`) distilled from the starter piece.
