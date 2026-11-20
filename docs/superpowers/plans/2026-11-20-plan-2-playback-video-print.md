# Plan 2 — Playback, video export, print

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Builds draw live on the piece page with a player bar (play/pause/replay/seek/speed/skip), visitors can export the build as MP4/WebM/GIF, and print or save a 300 DPI PDF at a chosen paper size.

**Architecture:** A pure pacing module maps elapsed time → target step. A DOM-free `Playback` controller drives the existing frozen runner (`createRunner().advance`) on an injectable frame clock; seeking backward recreates the runner. Video export renders frame-locked on an offscreen canvas and encodes with `mediabunny` (MP4 H.264, WebM VP9 fallback) or `gifenc`. Print lays the art out on a chosen paper size and renders it at 300 DPI as a grid of tiles with integer pixel boundaries, then calls `window.print()`.

**Tech Stack:** existing Next.js 16 / React 19 / Tailwind 4 / Vitest; new: `mediabunny` (exact pin), `gifenc` (exact pin).

**Spec:** `docs/superpowers/specs/2026-11-19-generative-art-portfolio-design.md` (sections "Playback and viewer UX", "Video export", "Print / Save as PDF").

## Global Constraints

- **Never run `git commit`, `git add`, `git stash`, push, or anything that changes git state.** The artist must give explicit permission per batch of work. "Checkpoint" = tests pass, stop.
- **Frozen, must not change output:** `src/lib/art/*`, `src/lib/render/runner.ts`, `validateParams` in `src/lib/piece/schema.ts`, decode rules in `src/lib/piece/share.ts`, `src/pieces/**`. Existing snapshot hashes must stay identical. Build on the runner; do not edit it.
- Read `node_modules/next/dist/docs/` before writing Next.js code (Next 16, `cacheComponents: true`).
- Every code change ships with tests (Vitest). Every user-visible change is validated in a real browser with the `agent-browser` skill (CLI `agent-browser` 0.39.x is installed): start a dev server on a free port, exercise the change, check the console, stop the server you started. Never kill processes you did not start.
- Playback pacing is viewer-only and never affects pixels of the final image; the final image of a played build must equal the instant render (same runner, same steps).
- Build playback default duration at 1×: **10 000 ms**, ease curve `f(t) = t^1.6` (slow start, faster finish). Speeds: `0.5 | 1 | 2 | 'instant'`. Frame step budget: **12 ms** per animation frame.
- Video: builds = **8 s build + 2 s hold**, **30 fps**, long edge **1080 px** (dimensions rounded down to even numbers). GIF: long edge **540 px**, **15 fps**, same 8 s + 2 s.
- Print: **300 DPI**, page margin **0.5 in**, caption height **0.35 in** (when on; default on), max tile edge **2048 px**.
- Paper sizes (id → inches): `letter` 8.5×11, `a4` 8.27×11.69, `a3` 11.69×16.54, `8x10` 8×10, `11x14` 11×14, `12x16` 12×16, `18x24` 18×24.

## Review Focus

1. **Played build ≠ instant render** (e.g. a skipped or doubled step at frame boundaries, seek off-by-one) → Task 2 test compares the step-call log of play vs finish.
2. **Tab hidden / slow device** — rAF pauses or frames take long; playback must not try to "catch up" with a giant blocking burst beyond the frame budget → Task 2 test with a fake clock jumping 60 s.
3. **Rapid param changes mid-playback** (new gen while playing) — old playback must stop drawing into the canvas → Task 3 test (destroy stops further steps) + browser check.
4. **Video export on browsers without H.264 encoder** (Firefox) — must fall back to WebM, not fail → Task 4 test of `pickVideoFormat` with stubbed capabilities.
5. **Print seams / mis-scaled tiles** — tile pixel sizes must sum exactly to the art size and logical rects must abut exactly → Task 5 tests.

---

## File Structure

```
src/lib/playback/
  pacing.ts            targetStep, easeBuild, constants, phaseFractions
  playback.ts          createPlayback controller (DOM-free, injectable clock)
src/lib/video/
  plan.ts              frame→step plan, output sizes
  encode.ts            exportVideo (browser; mediabunny / gifenc), pickVideoFormat
src/lib/print/
  paper.ts             PAPER_SIZES, layoutPrint
  tiles.ts             planTiles
src/app/art/[slug]/
  PlayerBar.tsx        player controls
  VideoExport.tsx      record button, format menu, progress, cancel
  print/page.tsx       print route (server)
  print/PrintView.tsx  print layout + rendering (client)
  ArtView.tsx          (modify) playback wiring, actions
  ParamPanel.tsx       (modify) live vs commit changes
src/lib/piece/generationState.ts  (modify) `motion` field
src/lib/piece/useGeneration.ts    (modify) setParam(key, value, live)
src/proxy.ts                      (modify) matcher includes /art/:slug/print
```

---

### Task 1: Pacing module

**Files:** Create `src/lib/playback/pacing.ts`; Test `src/lib/playback/pacing.test.ts`

**Interfaces — Produces:**
```ts
export type Speed = 0.5 | 1 | 2 | 'instant';
export const SPEEDS: readonly Speed[];                 // [0.5, 1, 2, 'instant']
export const BUILD_DURATION_MS = 10_000;
export const FRAME_BUDGET_MS = 12;
export function easeBuild(t: number): number;          // clamp t to [0,1], return t ** 1.6
export function targetStep(total: number, elapsedMs: number, speed: Exclude<Speed, 'instant'>): number;
  // integer in [0, total]; = total once elapsedMs * speed >= BUILD_DURATION_MS; floor(total * easeBuild(...))
export function phaseFractions(phases: { at: number; label: string }[] | undefined, total: number):
  { fraction: number; label: string }[];               // at/total clamped to [0,1], sorted, drops at<0 or at>total
```

- [ ] **Step 1: Failing tests:** `easeBuild(0)=0`, `easeBuild(1)=1`, `easeBuild(0.5)≈0.3299` (1e-4), clamps -1→0 and 2→1; `targetStep(320, 0, 1)=0`, `targetStep(320, 10_000, 1)=320`, `targetStep(320, 5_000, 2)=320`, `targetStep(320, 20_000, 0.5)=320`, monotonic non-decreasing over 0..12 000 ms in 16 ms steps, always an integer; `targetStep(0, x, 1)=0`; `phaseFractions([{at:160,label:'b'},{at:0,label:'a'}], 320)` → `[{0,'a'},{0.5,'b'}]`; undefined → `[]`.
- [ ] **Step 2:** Run `npx vitest run src/lib/playback/pacing.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Checkpoint** (no commit).

---

### Task 2: Playback controller

**Files:** Create `src/lib/playback/playback.ts`; Test `src/lib/playback/playback.test.ts`

**Interfaces:**
- Consumes: `createRunner` from `@/lib/render/runner` (do not modify it); `targetStep`, `FRAME_BUDGET_MS`, `Speed` from Task 1.
- Produces:
```ts
export interface PlaybackStatus { index: number; total: number; playing: boolean; done: boolean; speed: Speed }
export interface FrameClock {
  now(): number;                                  // ms
  request(cb: () => void): number;                // e.g. requestAnimationFrame
  cancel(id: number): void;
}
export interface Playback {
  play(): void; pause(): void; replay(): void;
  seek(step: number): void;                       // clamps to [0,total]; backward → new runner from 0
  finish(): void;                                 // budgeted like 'instant' (not one blocking call)
  setSpeed(speed: Speed): void;
  status(): PlaybackStatus;
  subscribe(fn: (s: PlaybackStatus) => void): () => void;
  destroy(): void;                                // cancels frames; no step ever runs after this
}
export function createPlayback(opts: {
  piece: PieceDefinition; gen: Generation; ctx: CanvasRenderingContext2D; widthPx: number;
  speed: Speed; autoplay: boolean; clock: FrameClock;
}): Playback;
```

Behavior:
- Timed speeds: each frame, compute the target with `targetStep(total, playedMs, speed)` where `playedMs` accumulates only while playing, and is capped per frame at 100 ms of wall time (so a hidden tab or a long frame never produces a catch-up burst). Advance toward the target, but stop running steps once `FRAME_BUDGET_MS` of `clock.now()` time has elapsed in that frame. The remaining steps carry over to the next frame.
- `'instant'` and `finish()`: run steps until `FRAME_BUDGET_MS` is used up in each frame, until done.
- `seek(k)`: if `k < index`, recreate the runner (setup + clear) and advance to `k` within budgeted frames. Pause after seeking.
- `replay()`: new runner, `playedMs = 0`, play.
- Subscribers are notified at most once per frame and on every state change. Notifications stop when done.
- `autoplay: false` renders nothing until `play()` or `finish()` is called.

- [ ] **Step 1: Failing tests** with a fake clock (`now` a mutable number; `request` queues the callback; a helper `tick(ms)` advances `now` and runs the queued callbacks) and a fake piece whose `step` appends `i` to a log and advances the fake `now` by a configurable cost:
  - Played to completion at 1×, the log equals `[0..total-1]` exactly once each, in order. This is identical to the `finish()` log.
  - After `tick(5000)` at 1×, `index === targetStep(total, 5000, 1)`, within the budget carry-over.
  - With a step cost of 5 ms and `instant`, each frame runs at most 3 steps (12 ms budget).
  - A `tick(60_000)` jump at 1× advances by no more than the target for 100 ms of play time.
  - `pause` stops index growth. `play` resumes from the same index.
  - `seek(10)` after index 50 gives a log tail of `0..9` from a fresh run, and `status().playing === false`.
  - `seek(total + 5)` clamps to total.
  - After `destroy()`, ticks never call `step`.
  - `subscribe` fires and its unsubscribe works.
  - `setSpeed('instant')` mid-play finishes on budgeted frames.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Checkpoint** (no commit).

---

### Task 3: Player UI and live/commit param changes

**Files:**
- Create: `src/app/art/[slug]/PlayerBar.tsx`
- Modify: `src/app/art/[slug]/ArtView.tsx`, `src/app/art/[slug]/ParamPanel.tsx`, `src/lib/piece/generationState.ts`, `src/lib/piece/useGeneration.ts`
- Test: `src/lib/piece/generationState.test.ts` (extend); `src/lib/playback/speedPreference.test.ts`

**Interfaces:**
- Consumes: `createPlayback`, `Speed`, `SPEEDS`, `phaseFractions`.
- Produces:
  - `GenerationState` gains `motion: 'play' | 'instant'`.
    - `load`, `regenerate`, `randomize` and `reset` set `'play'`.
    - `setParam` gains `live: boolean`; live sets `'instant'`, non-live sets `'play'`.
    - `initialGeneration` sets `'play'`.
  - `useGeneration().setParam(key, value, live = false)`.
  - `ParamPanel`'s `onChange(key, value, live)`.
    - Range sliders send `live = true` while dragging (the `input` event) and a final `live = false` on release (`pointerup`/`keyup`/`change`).
    - Every other control sends `live = false`.
  - `src/lib/playback/speedPreference.ts`:
    - `loadSpeed(storage: Storage | undefined, prefersReducedMotion: boolean): Speed`. It returns the stored speed if valid; otherwise `'instant'` when reduced motion is preferred, else `1`. Wrap every storage access in try/catch.
    - `saveSpeed(storage, speed): void`.

Behavior:
- `ArtCanvas` owns a single `Playback` per (gen, canvas size), created with `autoplay: motion === 'play'`. For `motion === 'instant'` it calls `finish()` instead. Changing the gen or the size `destroy()`s the previous playback first. The 120 ms re-render debounce for live changes stays.
- `PlayerBar` sits under the art with these controls:
  - Play/pause toggle.
  - Replay.
  - A progress bar showing `index/total` as a filled track. Click or drag it to seek, and use the arrow keys when it's focused (role `slider`, `aria-valuenow`).
  - Phase ticks with `title` labels.
  - Speed menu (0.5×, 1×, 2×, Instant), saved through `saveSpeed`.
  - Skip to end (`finish()`).
  - Step counter text.
- Functional styling consistent with the current page. The full visual design is Plan 4.

- [ ] **Step 1: Failing tests:**
  - Reducer: regenerate, randomize, reset and load → `'play'`; `setParam(live: true)` → `'instant'`; `setParam(live: false)` → `'play'`; `initialGeneration` → `'play'`.
  - `speedPreference`: valid stored value returned; garbage → default; reduced motion → `'instant'`; storage that throws → default; `saveSpeed` that throws doesn't throw.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement the reducer, preference, hook, panel, PlayerBar and ArtView wiring. **Step 4:** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` → green.
- [ ] **Step 5: Browser validation (agent-browser)** on `/art/flow-ribbons`:
  1. On load the build animates for about 10 s; progress reaches 100%.
  2. Pause, then play, resumes.
  3. Replay restarts from blank.
  4. Clicking mid-track seeks.
  5. Speed Instant finishes quickly; reload keeps the speed preference.
  6. Dragging the Particles slider updates without animating; releasing replays.
  7. Regenerate replays.
  8. Rapidly clicking Regenerate 5× gives one clean animation with no overlapping draws.
  9. No console errors.

  Save a screenshot mid-build to `tmp/` and list it in the report.
- [ ] **Step 6: Checkpoint** (no commit).

---

### Task 4: Video export

**Files:**
- Create: `src/lib/video/plan.ts`, `src/lib/video/encode.ts`, `src/app/art/[slug]/VideoExport.tsx`
- Modify: `src/app/art/[slug]/ArtView.tsx` (add the control to Actions), `package.json` (`npm i --save-exact mediabunny gifenc`; add types for gifenc if needed)
- Test: `src/lib/video/plan.test.ts`, `src/lib/video/encode.test.ts`

**Interfaces:**
- Consumes: `createRunner`, `easeBuild`.
- Produces:
  ```ts
  export interface VideoSpec { fps: number; buildSeconds: number; holdSeconds: number; longEdge: number }
  export const MP4_SPEC: VideoSpec;   // {30, 8, 2, 1080}
  export const GIF_SPEC: VideoSpec;   // {15, 8, 2, 540}
  export function videoSize(aspect: number, longEdge: number): { width: number; height: number }; // even, long edge <= longEdge
  export function buildFramePlan(total: number, spec: VideoSpec): number[];
    // length fps*(build+hold); frame f< buildFrames → floor(total*easeBuild((f+1)/buildFrames)); hold frames = total
  export type VideoFormat = 'mp4' | 'webm' | 'gif';
  export async function pickVideoFormat(canEncode: (codec: 'avc' | 'vp9') => Promise<boolean>): Promise<'mp4' | 'webm' | null>;
  export async function exportVideo(opts: {
    piece: PieceDefinition; gen: Generation; format: VideoFormat;
    onProgress(fraction: number): void; signal: AbortSignal;
  }): Promise<Blob>;
  ```
- `exportVideo`:
  - Renders on an `OffscreenCanvas` (fallback: a detached `<canvas>`) at `videoSize`.
  - For each planned frame, advances one runner to the target step and encodes the canvas with timestamp `f / fps`.
  - Yields to the event loop at least every frame, so the UI keeps updating.
  - Respects `signal` by throwing `AbortError`.
  - MP4 and WebM go through mediabunny's canvas source and output API. Read its docs and types in `node_modules/mediabunny` before writing this.
  - GIF goes through gifenc, quantizing per frame with a shared palette taken from the final frame.
  - Download filename: `${slug}-${seed}.${ext}`.
- `VideoExport` UI:
  - A "Record video" button that uses the format from `pickVideoFormat` (labelled MP4 or WebM), plus a secondary "GIF" option.
  - While recording, a progress bar and Cancel replace the button.
  - Errors show inline.
  - It is disabled while another export runs.

- [ ] **Step 1: Failing tests:**
  - `videoSize(0.8, 1080)` → `{864, 1080}`; `videoSize(16/9, 1080)` → `{1080, 606}`; both dimensions are always even.
  - `buildFramePlan(320, MP4_SPEC)` has length 300, is non-decreasing, frame 239 is 320, frames 240–299 are all 320, and frame 0 is ≥ 0.
  - `buildFramePlan(0, …)` is all zeros.
  - `pickVideoFormat` returns `'mp4'` when avc is supported; `'webm'` when only vp9 is; `null` when neither is.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm test`, lint, tsc, build → green.
- [ ] **Step 5: Browser validation (agent-browser):**
  - Record an MP4 of a featured code. Progress advances, the download completes, and the file is above 50 KB. Check the header bytes: `ftyp` for MP4, or `1A45DFA3` for WebM.
  - Record a GIF; its header starts `GIF89a`.
  - Cancel mid-export stops and resets the UI.
  - No console errors.
  - Save the files to `tmp/` and report their sizes.
- [ ] **Step 6: Checkpoint** (no commit).

---

### Task 5: Print / Save as PDF

**Files:**
- Create: `src/lib/print/paper.ts`, `src/lib/print/tiles.ts`, `src/app/art/[slug]/print/page.tsx`, `src/app/art/[slug]/print/PrintView.tsx`
- Modify: `src/proxy.ts` (matcher `['/art/:slug', '/art/:slug/print']`; 404 for unknown slugs on both), `src/app/art/[slug]/ArtView.tsx` (Actions: "Print / Save as PDF" link → `/art/<slug>/print?g=<code>`)
- Test: `src/lib/print/paper.test.ts`, `src/lib/print/tiles.test.ts`, extend `src/proxy.test.ts` (or the existing proxy test file)

**Interfaces — Produces:**
```ts
export interface Paper { id: string; label: string; widthIn: number; heightIn: number }
export const PAPER_SIZES: readonly Paper[];            // Global Constraints list, portrait dims
export const PRINT_DPI = 300, MARGIN_IN = 0.5, CAPTION_IN = 0.35;
export function layoutPrint(aspect: number, paper: Paper, caption: boolean): {
  orientation: 'portrait' | 'landscape';               // whichever gives the larger art area
  pageWIn: number; pageHIn: number; artWIn: number; artHIn: number;
  artWPx: number; artHPx: number;                      // round(in * PRINT_DPI); artWPx/artHPx ≈ aspect
};
export interface PrintTile { px: { x: number; y: number; w: number; h: number }; logical: Tile }
export function planTiles(artWPx: number, artHPx: number, aspect: number, maxTilePx = 2048): PrintTile[];
  // integer pixel boundaries; widths/heights sum exactly to art size; each ≤ maxTilePx;
  // logical.x = px.x / artWPx * 1000, logical.w = px.w / artWPx * 1000 (same for y with 1000/aspect)
```
- Print page:
  - The server page resolves the piece the same way the piece page does (`resolvePiece`, invalid → defaults + notice) and renders `PrintView`.
  - Controls: paper size select (default `letter`), caption toggle (default on), and a "Print / Save as PDF" button. The controls are hidden in `@media print`.
  - Each tile renders into its own `<canvas>` with `renderGeneration(piece, gen, ctx, tile.px.w, tile.logical)`, absolutely positioned in a container sized in inches. Yield between tiles and show "Rendering n/N"; the button is enabled only once rendering is done.
  - An `@page { size: <W>in <H>in; margin: 0 }` style is injected for the chosen size and orientation.
  - The caption is the title, `v<N> · seed`, and the share code in small mono text, shortened with an ellipsis in the middle if it is long.
  - On screen, a scaled preview fits the viewport.

- [ ] **Step 1: Failing tests:**
  - `PAPER_SIZES` has the 7 ids.
  - `layoutPrint(0.8, letter, true)` is portrait, and the art fits within (8.5 − 1) × (11 − 1 − 0.35) in with aspect preserved within 1 px.
  - `layoutPrint(2, letter, false)` is landscape.
  - `planTiles(2481, 3101, 0.8)`: the tile widths in each row sum to 2481, the heights in each column sum to 3101, and every tile is ≤ 2048.
  - Adjacent logical rects abut exactly (`a.x + a.w === b.x`).
  - `planTiles(100, 125, 0.8)` gives one tile with logical `{0, 0, 1000, 1250}`.
  - Proxy: `/art/nope/print` is rewritten to the 404; `/art/flow-ribbons/print` passes through.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm test`, lint, tsc, build → green.
- [ ] **Step 5: Browser validation (agent-browser):**
  - Open the print page for a featured code at Letter and at A3.
  - Rendering completes; the preview shows the art with the caption and no visible seams. Zoom a screenshot at a tile boundary to check.
  - Toggling the caption works, and `/art/nope/print` is a 404.
  - Generate a PDF: use agent-browser's PDF capability if available, otherwise Chrome headless `--print-to-pdf` on the page URL. Confirm it has 1 page at the right size.
  - No console errors. Save the screenshots and PDF to `tmp/`.
- [ ] **Step 6: Checkpoint** (no commit).

---

### Task 6: Docs and skills

**Files:** Modify `CLAUDE.md`, `.claude/skills/piece-contract/SKILL.md`, `.claude/skills/new-piece/SKILL.md`

- `CLAUDE.md`:
  - Add the print URL.
  - Mention the player, video export and print.
  - Add the `src/lib/playback`, `src/lib/video` and `src/lib/print` layout.
  - Remove "Plan 2" from the "coming" list.
- `piece-contract`:
  - Explain how `phases` show as ticks on the player.
  - Note that the build is paced to about 10 s whatever its step count, so `steps` should reflect visual progression. Each step should add a visible increment; avoid a single giant step.
- `new-piece`:
  - When iterating, use the player (Instant speed for fast tweaks).
  - Check the video export for builds before publishing.
- [ ] **Step 1:** Edit. **Step 2:** `npm test`, `npm run lint` → green. **Step 3: Checkpoint** (no commit).
