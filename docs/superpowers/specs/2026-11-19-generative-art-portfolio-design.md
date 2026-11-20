# Generative Art Portfolio — Design

Date: 2026-11-19
Status: draft, awaiting approval

## Intent

A personal portfolio of generative art. Visitors land on a gallery of hand-picked previews. Clicking one opens that piece's page: the art shown large, plus a side panel of configuration options the artist defined for that piece. Visitors can regenerate the art — new seed, tweaked options — and every generation gets a unique, shareable string that reproduces it exactly. Those strings will later be attached to paid prints, so a string must render the same image forever.

Part of the joy is watching the art draw live: strokes stacking, transparency accumulating. Some pieces build toward a finished image; others never finish or respond to the viewer's mouse/touch. All of them must be shareable and, where it makes sense, printable — including a moment a visitor captured from a live or interactive piece.

The repo is also a working studio. Each piece teaches techniques (recursion, flow fields, trigonometry, color theory, physics, interactivity). Those learnings get captured as agent skills, so later work can say "let's try applying flow fields to this" and the agent has the knowledge, formulas, and tested code at hand.

Inspiration: r/generative.

## Goals

- Gallery of hand-picked previews → per-piece page with large render + config panel.
- Per-piece config schema defined by the artist: numbers, integers, booleans, colors, palettes, choices (e.g. which shapes), etc. The schema drives the panel UI, URL encoding, and validation.
- Three kinds of piece on one contract: **builds** (finite, accumulate to a final image), **endless** (never finish), **interactive** (respond to pointer/keys; may be either finite or endless).
- Live playback of the drawing process, with sensible pacing and viewer controls.
- Deterministic generation: share string → identical result, now and later, including captured moments of endless/interactive pieces.
- Fixed aspect ratio per piece; renders at any resolution from thumbnail to print.
- Video export (MP4/WebM; GIF secondary) for sharing.
- Social previews: shared links show that exact generation/capture.
- Print now via browser: "Print / Save as PDF" at a chosen paper size, rendered ~300 DPI.
- Architecture ready for a paid print-on-demand API later (Prodigi / Gelato / Printful style: they accept a high-res raster).
- A skills library in the repo, for both site maintenance and art techniques.

## Non-goals (for now)

- 3D.
- Paid print ordering / checkout (later; design must not block it).
- Pen-plotter / SVG output.
- Accounts, favorites, comments.
- GPU/shader renderer. Contract leaves room for a `webgl2`/`webgpu` renderer kind; build it when a piece needs it.
- Audio-reactive input, webcam, or other input beyond pointer/touch/keyboard.
- Server-side video rendering (browser recording only for now; the contract permits server rendering later).

## Anti-goals (would be failure even if it "works")

- A published share string or capture that renders differently after a code change.
- A captured moment whose print looks visibly different from what the visitor saw.
- Pieces calling `Math.random()`, built-in transcendental `Math.*` functions, or reading the wall clock.
- Art that looks different at thumbnail vs print size beyond resolution (e.g. pixel-based line widths).
- Site chrome competing with the art. The art is the product.

## Constraints

- Stack: Next.js (App Router), React, Tailwind, TypeScript.
- Runs in the browser; 2D only. Hosting needs a server runtime (render endpoint, capture storage): Vercel default.
- Browser canvas size limits (iOS Safari ~16.7 MP). A 24×36" print at 300 DPI is ~78 MP, so large renders must be tiled.
- **No git commits without the artist's explicit permission.**

## Approaches considered

| Approach | Trade-off |
|---|---|
| p5.js 2.x | Familiar, huge corpus so AI writes it fluently. But owns the canvas and render loop (fights tiling, deterministic stepping, and React), slower on heavy particle work, outside libs can bypass its seeded random. |
| q5.js | p5-compatible API, faster, WebGPU. Small ecosystem, same canvas/loop-ownership issues. |
| Three.js WebGPU + TSL | Real GPU power; built for 3D, overkill for 2D, Firefox WebGPU still uneven. |
| **Thin in-house contract on Canvas 2D (chosen)** | Full control of randomness, stepping, resolution, and tiling; AI writes Canvas 2D very well; same code runs server-side via a Node Canvas 2D implementation. Cost: we build the helpers (rng, noise, math, color) — which become the skills library. |

Chosen by the artist: Canvas 2D in-house contract. Escape hatches: GPU renderer kind later; p5 in instance mode for an individual piece if wanted (it must still obey the step contract).

## Decided design

### Piece contract: every piece is a deterministic step machine

```ts
interface PieceDefinition<P, S> {
  slug: string;
  version: number;           // frozen once deployed
  title: string;
  description?: string;
  aspect: number;            // width / height, fixed per piece
  schema: ParamSchema<P>;
  interactive?: boolean;     // receives input
  setup(params: P, rng: Rng): S;                          // all randomness from rng
  step(ctx: CanvasRenderingContext2D, state: S, i: number, input: InputFrame): void;
  steps(state: S): number;   // finite for builds, Infinity for endless
  loopSteps?: number;        // endless pieces that loop seamlessly every N steps
  phases?: { at: number; label: string }[];               // optional timeline markers for builds
  accumulates?: boolean;     // default true; false = each step redraws the full frame
}
```

- **Steps, not time.** Simulation time is `i × dt` with fixed `dt` (1/60 s). Pieces never read the clock. Step N is identical on every machine, whether watched live or computed instantly.
- **Builds** (`steps` finite): the final image is the canvas after the last step. Pieces needing global knowledge (e.g. depth sorting) do it in `setup` and use few steps.
- **Endless** (`steps = Infinity`): any moment is identified by its step number.
- **Interactive**: the harness delivers an `InputFrame` per step (pointer position/buttons in logical coordinates, key events). Events are quantized to the step on which they land and recorded.
- **Logical coordinates.** The harness sets the transform so pieces draw in a space 1000 units wide and `1000 / aspect` tall. Line widths and sizes are in logical units.
- **Tiling.** For tiled renders the harness reruns `setup` + all steps per tile with a tile transform. For `accumulates: false` pieces, it may fast-forward and only draw the final step — the builder may split `step` into update/draw for that, at their discretion.
- **No pixel feedback.** Pieces must not read canvas pixels back into their simulation (`getImageData` etc.). Pixel-grid simulations (reaction-diffusion, cellular automata) keep their state in typed arrays and draw from them.

### Determinism (artist decisions)

- **Canonical renderer** = server (Node + `@napi-rs/canvas` / Skia). Its output is "the" image for social previews, official downloads, and prints. Browser renders are previews that may differ only in anti-aliasing. Pin the `@napi-rs/canvas` version; upgrading it re-checks every snapshot.
- **Deterministic math.** Basic arithmetic is identical across JS engines; built-in transcendental functions (`Math.sin/cos/tan/atan2/exp/log/pow/hypot/…`) may differ between V8 and JavaScriptCore, and differences compound in long simulations — which would make a server print of a captured moment diverge from what the visitor saw. The toolkit ships deterministic implementations (`import { sin, cos, atan2, exp, pow, … } from '@/lib/art/math'`); a lint rule bans `Math.random`, built-in transcendental `Math.*`, `Date`, and `performance.now` inside `src/pieces/**`. Applies to all pieces, so there is one rule. (`Math.sqrt`, `Math.abs`, `Math.floor`, `Math.min/max` etc. are IEEE-exact and allowed.)
- **Snapshot tests**: for each piece version, a set of share strings/captures is rendered by the server renderer and the pixel hash compared to a stored snapshot. A cross-engine test also runs the simulation (state hash after N steps) in a browser engine and Node to catch math leaks.

### Versioning (protects old links, captures, and prints)

- Pieces live at `src/pieces/<slug>/v<N>/`.
- **Workflow (artist decision): no draft state.** The artist iterates locally only. Deploying a piece version = publishing = frozen. Unfinished pieces are excluded from production builds (registry flag, e.g. `local: true`; mechanism is the builder's call).
- Any change that alters output becomes `v<N+1>`. Toolkit code that frozen versions depend on must not change output; behavior changes get a new function/version.
- The registry keeps every version. Old strings and captures render with their version forever. The piece page defaults to the latest version; opening an older one shows a "newer version exists" note.

### Share strings and captures

A **generation** is fully described by: `{ slug, version, seed, params, stopStep?, inputs? }`.

- **Generation link** (no inputs): `/art/<slug>?g=<code>`, `code` = base64url compact JSON `{ v, s, p, n? }` where `n` = stop step (endless pieces, or a mid-build moment). Full params stored, self-contained.
- **Capture link** (has an input log): input logs are too large for URLs, so the generation is stored server-side and addressed by a short id: `/c/<id>`. Input log is delta-encoded and compressed.
- **Public capture saving (artist decision: anyone can save).** A public endpoint stores captures (Vercel Blob or similar). Required protections: max payload size, max steps/duration per capture, per-IP rate limiting, server-side validation (decode, schema check, version exists). Captures are immutable once stored.
- Seed: random URL-safe string generated client-side, hashed to seed the PRNG.
- Invalid or unknown codes → defaults with a visible notice (generation links) or a not-found page (captures).
- Both kinds are what a future print order references.

### Playback and viewer UX

Builds:

```
 ▶ ❚❚  ↻ replay   ━━━━━━━●──── 64%  1× ▾   ⏭ skip to end
```

- Opening a link plays the build. Default pacing fits any build into ~10 s regardless of step count, with an ease curve (slow start so structure is visible, then faster). Speed menu (0.5×, 1×, 2×, instant) and skip-to-end are viewer preferences, not in the share string.
- Dragging a param slider shows the finished result instantly (responsive); releasing replays the build. Regenerate / Randomize replay.
- Optional `phases` render as ticks on the progress bar.

Endless / interactive:

```
 ● live   ❚❚ pause   ↻ restart   📷 capture   ⏺ record 10s ▾
```

- Runs in real time at 60 steps/s; if the device can't keep up, the sim slows rather than skipping steps.
- **Capture** freezes the moment and produces a generation link (no inputs) or a stored capture link (inputs). Captured moments are printable/downloadable like builds.
- Interactive pieces show a short hint ("drag on the art"); touch maps to pointer.

### Video export

- MP4 (H.264 via WebCodecs; WebM fallback) primary; GIF offered secondary with a note about banding.
- Builds: ~8 s build + 2 s hold on the final image. Endless: 5/10/15 s clip from the current state, or a seamless loop when `loopSteps` is declared. Interactive: records the session including the viewer's input.
- Recording is frame-locked (encodes every frame deterministically, never drops), so slow devices produce smooth video, just slower to export. Default 1080 px on the long edge.

### Server render endpoint and social previews

- Node-runtime route renders any generation link or capture with the canonical renderer and returns PNG (e.g. `/api/render?g=…&slug=…&w=…`, `/api/render/c/<id>?w=…`). Immutable per (input, width), cached aggressively.
- Piece and capture pages set Open Graph / Twitter image metadata (via `generateMetadata`) pointing at this endpoint (~1200 px), so posted links show that exact generation.
- Public widths are capped; step count per request is capped to bound cost. Large print renders tile server-side or use a separate authenticated path later.
- Backs "Download PNG"; the thumbnail script calls the same render function.

### Config panel

- Generated from the schema. Param kinds for v1: `number` (min/max/step), `integer`, `boolean`, `color`, `palette`, `select`, `multiselect`.
- Each param may carry label, description, group, and whether Randomize may touch it.
- Actions: **Regenerate** (new seed), **Randomize** (seed + randomizable params), **Reset**, **Copy link**, **Download PNG**, **Record video**, **Print / Save as PDF**, plus **Capture** on endless/interactive pieces.
- Param changes update the URL with `replaceState` (debounced); Regenerate/Randomize use `pushState`.
- **(Artist request, 2026-11-20)** The controls must look clean and refined: this is an art site, and the panel should feel like part of the work, not stock form widgets (custom-styled sliders, swatches, toggles and segmented choices; quiet typography; restrained hierarchy; the art stays dominant). The panel scrolls independently so the art stays in view.

### Gallery

- Each piece version declares `featured: string[]` — generation codes or capture ids the artist hand-picked.
- **(Artist request, 2026-11-20)** Each piece shows exactly **3 featured generations: one primary ("the best") and two follow-ups**. `featured[0]` is the primary; `featured[1..2]` are the follow-ups (enforce exactly 3 per published piece in tests). The gallery shows one visually unified group per piece — the primary given clear prominence, the two follow-ups subordinate — so visitors see the variety the piece produces while one is highlighted. Grouping must read clearly and aesthetically, not as three unrelated tiles.
- Thumbnails are pre-rendered PNGs from a script (same server renderer) and built into `public/`. Clicking opens the piece page with that generation, which then plays its build/live animation.

### Print / Save as PDF

- Route `/art/<slug>/print?g=<code>&size=<id>` (and the capture equivalent).
- Paper sizes: Letter, A4, A3, 8×10, 11×14, 12×16, 18×24…; art fit inside with margins, keeping its aspect.
- Rendered at 300 DPI via tiles in the browser (preview-quality by definition — accepted); `window.print()` provides "Save as PDF". Caption with title and share code under the art, default on.

### Art toolkit — `src/lib/art/`

Seeded PRNG (e.g. sfc32 + string hash) and helpers (range, int, pick, shuffle, gaussian, weighted); deterministic math (`sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, …); seeded simplex/value noise (2D/3D, built on deterministic math); vectors; easing; OKLCH color utilities and palettes; geometry helpers; input helpers (logical pointer, drag deltas).

### Skills library — `.claude/skills/`

Project-scoped Claude Code skills, one folder each with `SKILL.md` plus optional references, code samples, and scripts.

- **Site skills** (initial): `new-piece` (scaffold a piece version: schema, contract, featured codes, snapshots), `publish-piece` (pre-deploy checklist: snapshots, thumbnails, lint, freeze), `new-version` (fork a frozen version safely).
- **Art skills** (initial): `piece-contract` (how to write pieces: steps, logical coords, kinds, interactivity, no-pixel-feedback), `seeded-randomness-and-determinism` (rng, deterministic math, why). Technique skills (`flow-fields`, `recursion`, `color-theory`, …) are added as pieces teach them.

### Starter content

Two small pieces designed by the builder to prove the plumbing end to end:
1. A flow-field **build** (finite, accumulating, transparency) — proves playback, share strings, gallery, print, video, social previews.
2. A small **endless interactive** piece (e.g. particles that respond to the pointer) — proves real-time mode, input recording, capture storage, capture links, and server replay matching the browser.

## Calls made by the designer (check these)

- Logical drawing space is 1000 units wide; fixed timestep 1/60 s.
- Generation links store full params in the URL; only input-bearing captures use server storage + short ids.
- Deterministic math applies to all pieces, not just live ones.
- Default build playback ~10 s with an ease curve; video ~8 s + 2 s hold at 1080 px.
- MP4 primary, GIF secondary.
- Skills live in `.claude/skills/` in this repo.
- Two starter pieces (one build, one endless interactive) instead of one.

## Left to the builder

- Visual design of the site chrome (gallery grid, detail layout, panel, player controls). Direction: art-first, minimal, dark-friendly. A dedicated design pass can follow once the plumbing works.
- Exact PRNG, deterministic-math algorithms, noise implementation, input-log encoding/compression, debounce timings, ease curve.
- Capture storage provider details, rate-limit mechanism, and caps (sizes, steps, widths).
- Gallery: one tile per featured item vs per piece.
- Lint mechanism for banned APIs in pieces.
- Deploy details beyond "Vercel with Node functions; static pages where possible".
