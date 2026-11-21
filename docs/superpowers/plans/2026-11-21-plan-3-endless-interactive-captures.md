# Plan 3 — Endless and interactive pieces, captures

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endless pieces run live at 60 steps/s, interactive pieces record the viewer's pointer/keys, and any live moment can be captured as a share link (`?g=` with `n`, no input) or a stored capture (`/c/<id>`, with input) that the server renders, previews, prints and exports identically; plus a second starter piece and a cross-engine determinism check.

**Architecture:** An input log (delta-encoded pointer/key events, pointer quantized to 0.1 logical units) is the single source of truth: live play feeds the piece the same `InputFrame`s a replay of the log produces. The runner gains an additive optional input source (output for existing codes unchanged); a capture is then just a finite build `{v,s,p,n}` plus its log, so the existing Playback, print and video paths replay it. A DOM-free `LiveSim` drives open-ended real-time stepping. Captures are validated and canonicalized server-side, content-addressed (id = hash), and stored in Vercel Blob (filesystem in dev).

**Tech Stack:** existing Next.js 16 / React 19 / Tailwind 4 / Vitest / `@napi-rs/canvas`; new: `@vercel/blob` 2.9.0 (exact), `playwright` 1.65.1 (exact, devDependency), `esbuild` (exact devDependency pin of the version already in `node_modules`).

**Spec:** `docs/superpowers/specs/2026-11-19-generative-art-portfolio-design.md` (sections "Piece contract", "Share strings and captures", "Playback and viewer UX" → Endless / interactive, "Video export", "Server render endpoint", "Starter content", cross-engine bullet under "Determinism").

## Global Constraints

- **Never run `git commit`, `git add`, `git stash`, push, or anything that changes git state.** The artist approves commits per batch. "Checkpoint" = tests + lint pass, stop.
- **Frozen output:** `src/lib/art/*`, `validateParams`, share-code decode rules, `src/pieces/flow-ribbons/**`. `src/lib/render/runner.ts` may change **only** as Task 2 specifies (one optional trailing parameter); every existing snapshot hash must stay identical.
- Read `node_modules/next/dist/docs/` before writing Next.js code (Next 16, `cacheComponents: true`, `src/proxy.ts`, no `runtime` segment export).
- Every code change ships with tests. Every user-visible change is validated in a real browser with `agent-browser` (dev server on a free port you start and stop yourself; never kill processes you did not start; port 3000 is taken by another app).
- Pieces stay deterministic (lint bans). Pointer coordinates reach pieces only as quantized values: `x = qx / 10` with integer `qx`.
- Live rate **60 steps/s** (`DT = 1/60`); frame step budget **12 ms**; wall time credited per frame at most **100 ms**; when a frame cannot finish its due steps within budget the backlog is **dropped** (the sim slows, never skips steps).
- Live sim stops at `MAX_STOP_STEP` (100 000 steps ≈ 27 min) with the notice **"Reached the 27-minute limit. Capture this moment or restart."**
- Capture caps: request body ≤ **768 KiB** (raised from 512 KiB in the final fixes: the worst valid 30 000-event log is ~700 KB); input events (pointer + key) ≤ **30 000**; key string length ≤ **16**; `1 ≤ n ≤ MAX_STOP_STEP`; saves per IP: **10 per 10 minutes** (per server instance).
- Capture id: first **12** chars of base64url(sha256(canonical capture JSON)); URL form `/c/<id>`, id regex `^[A-Za-z0-9_-]{12}$`.
- Endless video clips: **5 / 10 / 15 s** (default 10) from the current step; MP4 30 fps (one frame per 2 steps), GIF 15 fps (one frame per 4 steps), same sizes as Plan 2. Seamless loop option when `loopSteps` is declared (must be a positive multiple of 4).
- Interactive hint copy: **"Drag on the art"**. Touch maps to pointer (`touch-action: none` on the canvas).

## Review Focus

1. **Live ≠ replay** — a recorded session replayed (browser Playback, server render, video) must draw exactly what the viewer saw. Pinned by Task 1 (record→replay frames deep-equal for a random session) and Task 6 (call-log of live run equals call-log of replayed capture).
2. **Hostile capture uploads** — oversized body, unknown slug/version, non-interactive piece with inputs, bad params, events out of order or out of bounds, `n` past cap, junk JSON → 400/413, never stored. Task 5 table test.
3. **Slow device / hidden tab** in live mode — no catch-up burst after a 60 s gap, steps never skipped. Task 3 fake-clock test.
4. **Resize or param change mid-session** — resize resumes at the same step with the same recorded input; a param change restarts from 0 with an empty log. Task 3 (resume) + Task 6 browser check.
5. **Storage unavailable / rate limited** — save returns 503/429 and the UI says so; the visitor can still copy a `?g=` link when there was no input. Task 5 + Task 6.

---

## File Structure

```
src/lib/input/
  log.ts            InputLog type, quantize, appendFrame, replaySource, validateInputLog
  recorder.ts       createRecorder: DOM-state → per-step InputFrame + log
src/lib/render/runner.ts   (modify, additive) optional input source
src/lib/playback/playback.ts (modify) `input` option passed to runner
src/lib/live/
  live.ts           createLiveSim (DOM-free, injectable clock)
src/pieces/murmuration/v1/  index.ts, snapshots.json  (second starter piece)
src/pieces/index.ts         (modify) register it
src/lib/capture/
  record.ts         CaptureRecord, canonicalCapture, captureId, validateCapture
  store.ts          CaptureStore: memory / filesystem / Vercel Blob; captureStore()
  rateLimit.ts      createRateLimiter, clientIp
src/app/api/captures/route.ts        POST save
src/app/api/render/c/[id]/route.ts   GET PNG of a capture
src/app/art/[slug]/
  ArtView.tsx       (modify) endless/interactive → LiveCanvas
  LiveCanvas.tsx    live canvas, pointer/key wiring, hint, resize resume
  LiveBar.tsx       ● live / pause / restart / capture / record
  CaptureDialog.tsx link result, copy, errors
src/app/c/[id]/page.tsx, CaptureView.tsx, print/page.tsx
src/app/art/[slug]/print/PrintView.tsx (modify) optional input log
src/lib/video/plan.ts, encode.ts (modify) clip/loop plans, input source
src/proxy.ts (modify) /c/:id format check
src/lib/determinism/probe.ts  call-log hashing probe (engine-neutral)
scripts/cross-engine.ts       Node vs WebKit vs Firefox
```

---

### Task 1: Input log and recorder

**Files:** Create `src/lib/input/log.ts`, `src/lib/input/recorder.ts`; Test `src/lib/input/log.test.ts`, `src/lib/input/recorder.test.ts`

**Interfaces — Produces:**
```ts
// log.ts
export const POINTER_QUANTUM = 10;       // stored ints = logical × 10
export const MAX_INPUT_EVENTS = 30_000;
export const MAX_KEY_LENGTH = 16;
/** p: pointer changes, [dStep] = pointer gone, [dStep, qx, qy, down(0|1)];
 *  k: key presses [dStep, key]. dStep is relative to the previous entry of the same list (first: relative to step 0). */
export interface InputLog { p: number[][]; k: [number, string][] }
export const EMPTY_LOG: InputLog;                          // { p: [], k: [] }
export function quantize(v: number): number;               // Math.round(v * 10)
export function isEmptyLog(log: InputLog): boolean;
export function eventCount(log: InputLog): number;
/** Stateful; queries must be non-decreasing in i (the runner's order). Returns frames equal to what was recorded. */
export function replaySource(log: InputLog): (i: number) => InputFrame;
export function validateInputLog(raw: unknown, bounds: { width: number; height: number; n: number }):
  { ok: true; log: InputLog } | { ok: false; error: string };
// recorder.ts
export interface Recorder {
  setPointer(p: { x: number; y: number; down: boolean } | null): void; // logical, unquantized
  pressKey(key: string): void;                                         // ignored if key.length > MAX_KEY_LENGTH
  /** Called once per step, in order: builds the frame from current state, logs changes, drains keys. */
  frame(i: number): InputFrame;
  log(): InputLog;                       // copy
  /** Drop events at steps >= i (resume after rewind). */
  truncate(i: number): void;
}
export function createRecorder(): Recorder;
```

Frame rules: `pointer` = last set pointer with `x = qx/10, y = qy/10` (clamped to the logical area before quantizing) or `null`; `keys` = keys pressed since the previous `frame()` call, in order. A pointer entry is logged only when the quantized frame pointer differs from the previous step's. `InputFrame` objects from replay and live must be deep-equal.

- [ ] **Step 1: Failing tests:** quantize(12.34)=123, quantize(-0.04)=0 (and `Object.is(…, 0)` true, no -0); replay of `EMPTY_LOG` gives `EMPTY_INPUT`-equal frames; a scripted session (pointer enter at 3, move at 5, down at 5, key 'a' at 7, leave at 9) → log `{p:[[3,…],[2,…],[4]], k:[[7,'a']]}`; **property test:** 50 seeded random sessions of 500 steps (use `createRng`) — `frame(i)` from the recorder deep-equals `replaySource(log())(i)` for every i; `truncate(6)` then replay matches frames 0..5; `validateInputLog` rejects: non-object, negative dStep, second pointer entry at the same step (dStep 0 after the first), qx outside `[0, width*10]`, down not 0/1, key > 16 chars, last event step ≥ n, > 30 000 events, extra keys; accepts the scripted log.
- [ ] **Step 2:** `npx vitest run src/lib/input` → FAIL.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** Run → PASS; `npm run lint`.
- [ ] **Step 5: Checkpoint** (no commit).

### Task 2: Input through runner, playback and video

**Files:** Modify `src/lib/render/runner.ts`, `src/lib/render/server.ts`, `src/lib/playback/playback.ts`, `src/lib/video/encode.ts`; Tests alongside (`runner.test.ts`, `server`-level test in `tests/smoke.test.ts`, `playback.test.ts`).

**Interfaces — Produces:**
```ts
// runner.ts — ONLY change allowed: trailing optional param; default keeps EMPTY_INPUT
export type InputSource = (i: number) => InputFrame;
export function createRunner(piece, gen, ctx, outWidthPx, tile?: Tile, input?: InputSource): Runner;
export function renderGeneration(piece, gen, ctx, outWidthPx, tile?: Tile, input?: InputSource): void;
// server.ts
export function renderPng(piece, gen, widthPx, input?: InputLog): Promise<Buffer>; // builds replaySource(log) per call
// playback.ts: createPlayback opts gain `input?: InputLog` — a fresh replaySource per runner (seek-back recreates it)
// encode.ts: ExportVideoOptions gain `input?: InputLog` and `frames?: number[]` (step per frame; default = buildFramePlan)
```

- [ ] **Step 1: Failing tests:** runner passes `input(i)` to `step` for i = 0..n-1 in order and `EMPTY_INPUT` when omitted; a piece that draws at `input.pointer` renders different PNGs with/without a log (server); playback seek backward then forward gives the same step/input call log as an uninterrupted run; `npm test` snapshot hashes unchanged.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS (all existing snapshots identical), lint clean.
- [ ] **Step 5: Checkpoint.**

### Task 3: LiveSim controller

**Files:** Create `src/lib/live/live.ts`; Test `src/lib/live/live.test.ts`

**Interfaces — Consumes:** `FrameClock` (`src/lib/playback/playback.ts`), `createRunner`, `Recorder`. **Produces:**
```ts
export const LIVE_STEPS_PER_SECOND = 60;
export const LIMIT_NOTICE = 'Reached the 27-minute limit. Capture this moment or restart.';
export interface LiveStatus { index: number; playing: boolean; limited: boolean; catchingUp: boolean }
export interface LiveSim {
  play(): void; pause(): void;
  restart(): void;                      // new runner at 0, recorder.truncate(0), plays
  status(): LiveStatus;
  subscribe(fn: (s: LiveStatus) => void): () => void;
  /** Pauses; returns the moment: stop step and a copy of the log up to it. */
  capture(): { n: number; input: InputLog };
  destroy(): void;
}
export function createLiveSim(opts: {
  piece: PieceDefinition; gen: Generation;  // gen.n ignored
  ctx: CanvasRenderingContext2D; widthPx: number;
  recorder: Recorder; clock: FrameClock;
  /** Resume after resize: replay steps [0, startAt) from recorder.log() on budgeted frames (catchingUp=true), then continue live; autoplay decides play vs pause after. */
  startAt?: number; autoplay: boolean;
}): LiveSim;
```

Runner: for endless pieces call `createRunner` with `{...gen, n: MAX_STOP_STEP}` (finite pieces: their own total); live steps take input from `recorder.frame(i)`, catch-up steps from `replaySource(recorder.log())`. Per frame: `acc += min(dt, 100) * 60 / 1000`; run `floor(acc)` steps while under the 12 ms budget; if the budget ran out, set `acc = 0`. At `index === runner.total` for an endless piece: pause, `limited: true`. A finite interactive piece just finishes (done = paused at end).

- [ ] **Step 1: Failing tests** (fake clock + fake piece recording `(i, input)`): 1 s of 16.67 ms frames → 60 steps; a 60 s clock jump → at most 6 steps that frame (100 ms cap), no later burst; budget exhaustion (clock `now` advancing 13 ms per step) drops backlog and steps stay contiguous (no index skipped); pause stops steps, play resumes without a jump; `capture()` returns `n = index` and the log; `restart()` clears the log and index; `startAt: 300` replays recorded input for 0..299 (call log equal to the original run) then continues live; reaching the cap sets `limited` and stops; `destroy()` → no further `step` calls.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + lint. **Step 5: Checkpoint.**

### Task 4: Second starter piece — `murmuration` v1

**Files:** Create `src/pieces/murmuration/v1/index.ts`, `snapshots.json`; Modify `src/pieces/index.ts`; Tests run via existing `tests/snapshots.test.ts`, `tests/piece-lint.test.ts`, plus `src/pieces/murmuration/v1/index.test.ts`.

Endless (`steps → Infinity`), interactive, `accumulates: true`, aspect **1** (square). Particles drift on a seeded 3D-noise flow field (z = time) and leave fading trails (each step paints a translucent background rect, alpha from a `trail` param). While the pointer is down particles within `radius` are attracted to it (repelled if the `mode` select is `'repel'`); pressing Space (`' '`) scatters them with a radial impulse. Draws in logical units only. Params (all with label/group): `count` integer 100–1500 default 600; `speed` number 0.5–4 default 1.6; `noiseScale` number 0.5–5 default 1.8; `trail` number 0.02–0.3 default 0.08; `radius` integer 40–400 default 160; `mode` select `['attract','repel']`; `palette` palette (5 colours, 3 presets); `background` color `#0b0b10`. No `loopSteps`. Cost: ≤ ~2 ms per step at 1500 particles in Node.

- [ ] **Step 1: Failing tests:** `steps(state) === Infinity`; same seed + same input log → identical `renderPng` bytes; an input log with a pointer-down drag changes the image vs `EMPTY_LOG`; Space key changes it; 100 000 steps at count 1500 render in Node within 60 s (marked as a slow test, timeout 120 s).
- [ ] **Step 2:** FAIL. **Step 3:** Implement with `@/lib/art/*` only; pick **exactly 3** `featured` codes with `n` (primary first) that look good at 400 px; add one `snapshotCodes` entry with `mode: 'repel'`.
- [ ] **Step 4:** `UPDATE_SNAPSHOTS=1 npx vitest run tests/snapshots.test.ts` once, then `npm test` and `npm run lint` → PASS; `npm run thumbs` renders the 3 thumbnails.
- [ ] **Step 5: Checkpoint.**

### Task 5: Capture record, storage, rate limit, API

**Files:** Create `src/lib/capture/{record,store,rateLimit}.ts` + tests, `src/app/api/captures/route.ts`, `src/app/api/render/c/[id]/route.ts` + route tests; Modify `package.json` (`@vercel/blob` 2.9.0 exact), `.gitignore` (`/.captures/`).

**Interfaces — Produces:**
```ts
// record.ts
export interface CaptureRecord { slug: string; v: number; s: string; p: Params; n: number; i: InputLog }
export const MAX_CAPTURE_BYTES = 768 * 1024; // was 512 KiB; raised in the final fixes
export const CAPTURE_ID_RE = /^[A-Za-z0-9_-]{12}$/;
/** Fixed key order slug,v,s,p,n,i; p re-ordered by schema key order. */
export function canonicalCapture(c: CaptureRecord): string;
export function captureId(canonicalJson: string): Promise<string>;  // sha256 via globalThis.crypto.subtle, base64url, 12 chars
/** Shape + registry + schema + log checks. Rejects: unknown slug/version, non-interactive piece, validateParams issues (no silent repair), n out of [1, MAX_STOP_STEP], empty log (use a ?g= link), invalid log (bounds from piece.aspect, n). */
export function validateCapture(raw: unknown): { ok: true; capture: CaptureRecord } | { ok: false; error: string };
// store.ts
export interface CaptureStore { get(id: string): Promise<string | null>; put(id: string, json: string): Promise<void> }
export function memoryStore(): CaptureStore;
export function fileStore(dir: string): CaptureStore;          // dev: `.captures/<id>.json`
export function blobStore(token: string): CaptureStore;        // @vercel/blob put/head, path `captures/<id>.json`, public, no random suffix; put of an existing id is a no-op
/** BLOB_READ_WRITE_TOKEN → blob; else NODE_ENV !== 'production' → fileStore('.captures'); else null (saving unavailable). */
export function captureStore(env?: NodeJS.ProcessEnv): CaptureStore | null;
export function loadCapture(id: string, store?: CaptureStore | null): Promise<CaptureRecord | null>; // re-validates
// rateLimit.ts
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): { take(key: string): boolean };
export function clientIp(headers: Headers): string;   // first x-forwarded-for entry, else x-real-ip, else 'unknown'
```

`POST /api/captures` body = `CaptureRecord` JSON → `201 {id, url: '/c/<id>'}` (200 if it already existed). Errors: `413` body > 512 KiB (check `content-length` and actual bytes), `400 {error}` invalid, `429` rate limited (`Retry-After`), `503 {error: 'Capture saving is not configured'}` when no store. `GET /api/render/c/[id]?w=` → PNG like `/api/render` (same width caps, immutable cache), `404` unknown/malformed id. Read `node_modules/@vercel/blob` README/types for the 2.9.0 API before writing `blobStore`.

- [ ] **Step 1: Failing tests:** canonicalization is order-independent and `captureId` is stable (pin one known id); `validateCapture` table: each hostile case from Review Focus #2 → `ok:false`, a good murmuration capture → ok; fileStore round-trip in a temp dir; rate limiter allows 10 then blocks the 11th within 10 min and frees after the window; route tests (call `POST`/`GET` handlers directly with a memory store injected via a module-level setter `__setCaptureStoreForTests`): 201 then 200 on repeat, 413, 400, 429 on the 11th, 503 with no store, render 200 `image/png` and 404.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + lint + `npm run build`.
- [ ] **Step 5: Checkpoint.**

### Task 6: Live piece page — LiveCanvas, LiveBar, Capture

**Files:** Create `src/app/art/[slug]/{LiveCanvas,LiveBar,CaptureDialog}.tsx`, `src/lib/capture/client.ts` (+ test); Modify `ArtView.tsx`.

**Interfaces — Consumes:** `createLiveSim`, `createRecorder`, `encodeGeneration`, `POST /api/captures`. **Produces:**
```ts
// client.ts
export type CaptureResult = { kind: 'link'; url: string } | { kind: 'stored'; url: string } | { kind: 'error'; message: string };
/** Empty log → '/art/<slug>?g=<code with n>' without a request; else POST. Messages: 429 → 'Too many captures — try again in a few minutes.', 503 → 'Saving captures isn't available here. ', other → 'Couldn't save the capture.' */
export function saveCapture(slug: string, gen: Generation, moment: { n: number; input: InputLog }, fetcher?: typeof fetch): Promise<CaptureResult>;
```

Add `isLive(piece, gen): boolean` to `src/lib/live/live.ts` (`piece.interactive === true` or `piece.steps(setup(validated params, createRng(gen.s)))` is not finite; memoize per gen in ArtView). ArtView: a piece where `isLive` holds and `gen.n` is absent renders `LiveCanvas` + `LiveBar` instead of `ArtCanvas` + `PlayerBar`. An endless piece **with** `gen.n` (a captured moment link) uses the existing build Playback to step `n`, plus a **"Go live"** button that drops `n` (pushState) and starts live. LiveCanvas: pointer events (`pointerdown/move/up/leave/cancel`, mapped from CSS px to logical units through the canvas rect) → `recorder.setPointer`; `keydown` while the canvas has focus (`tabIndex=0`) → `recorder.pressKey` (Space prevented from scrolling); hint "Drag on the art" for interactive pieces until the first pointerdown; resize → new sim with `startAt` = previous index and the same recorder; gen change → new recorder + sim from 0. LiveBar: `● live` / `paused` state, pause/play, restart, **Capture**, limit notice. Capture → pause, `saveCapture`, `CaptureDialog` with the URL, **Copy link**, **Open**, and **Resume** (unpause).

- [ ] **Step 1: Failing tests:** `saveCapture` with empty log returns a `link` whose code decodes to `{v,s,p,n}` and makes no fetch; non-empty → POST body equals `canonicalCapture` input fields; 429/503/500 map to the exact messages. A jsdom-free determinism test: drive `createLiveSim` with a scripted recorder session on a recording fake ctx, capture, then `createRunner(..., replaySource(log))` to `n` → identical call logs (Review Focus #1).
- [ ] **Step 2:** FAIL. **Step 3:** Implement.
- [ ] **Step 4:** PASS + lint. **Browser (agent-browser):** `/art/murmuration` runs live; drag attracts particles; Space scatters; pause/restart work; resize keeps the step and picture; Capture with no interaction yields a `?g=` link that opens paused at the same image; Capture after dragging yields `/c/<id>` (dev file store); console clean.
- [ ] **Step 5: Checkpoint.**

### Task 7: Capture page, print, OG, proxy

**Files:** Create `src/app/c/[id]/{page,CaptureView}.tsx`, `src/app/c/[id]/print/page.tsx`, `src/app/c/[id]/not-found.tsx`; Modify `src/app/art/[slug]/print/PrintView.tsx` (optional `input?: InputLog`, `title`/caption code shows `c/<id>`), `src/proxy.ts` + test (`/c/:id`, `/c/:id/print`: malformed id → 404 rewrite).

`/c/<id>`: loads via `loadCapture` (wrap the storage read in `'use cache'` with `cacheLife('max')` — captures are immutable), shows the piece title, the build Playback replaying the capture to `n` with its log (PlayerBar works), Download PNG (`/api/render/c/<id>?w=4096`), Record video (build-style 8 s + 2 s replay with the log; `VideoExport` gains an optional `input?: InputLog` prop passed to `exportVideo`), Print / Save as PDF (`/c/<id>/print`), Copy link, and "Open this piece live" → `/art/<slug>`. Metadata: OG/Twitter image `/api/render/c/<id>?w=1200`. Unknown well-formed ids render the not-found UI (status may be 200 under Cache Components; documented).

- [ ] **Step 1: Failing tests:** proxy matcher/404 for `/c/bad!` and pass-through for a well-formed id; `generateMetadata` image URL for a stored capture (memory store); PrintView tile render with input equals `renderGeneration` with the same log (pure helper test).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + lint + build. **Browser:** open a capture from Task 6 — replay ends on the captured image; PNG matches visually; print page shows the caption `c/<id>`; `/c/AAAAAAAAAAAA` shows not-found.
- [ ] **Step 5: Checkpoint.**

### Task 8: Endless video — clips, loops, recorded sessions

**Files:** Modify `src/lib/video/plan.ts` (+ tests), `src/lib/video/encode.ts`, `src/app/art/[slug]/VideoExport.tsx` (or a `LiveVideoExport.tsx` used by LiveBar).

**Interfaces — Produces:**
```ts
export const CLIP_SECONDS = [5, 10, 15] as const;
/** Steps for each frame of a clip starting at `from`: from + k * stepsPerFrame, k = 0..seconds*fps-1; stepsPerFrame = 60 / fps. */
export function clipFramePlan(from: number, seconds: number, fps: number): number[];
/** One period: frames at loopSteps + k * stepsPerFrame for k < loopSteps / stepsPerFrame. */
export function loopFramePlan(loopSteps: number, fps: number): number[];
```

Non-interactive endless: **Record 5/10/15 s** encodes immediately, offscreen, from the current step (replaying the current log to it). Interactive: **Record 10 s ▾** (5/10/15) records the live session in real time (red "● recording 7s" in LiveBar), then encodes frame-locked from the recorded log; **Loop** appears only when `loopSteps` is declared. Clips beyond `MAX_STOP_STEP` are clamped. Builds keep Plan 2 behaviour.

- [ ] **Step 1: Failing tests:** `clipFramePlan(100, 5, 30)` → 150 frames, first 100, step 2; GIF fps 15 → step 4; `loopFramePlan(240, 30)` → 120 frames starting at 240, last 478; a registry test that every piece's `loopSteps` (if any) is a positive multiple of 4.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + lint. **Browser:** record a 5 s MP4 of murmuration while dragging → file plays, shows the drag; GIF 5 s works.
- [ ] **Step 5: Checkpoint.**

### Task 9: Cross-engine determinism check, docs, skills

**Files:** Create `src/lib/determinism/probe.ts` (+ test), `scripts/cross-engine.ts`; Modify `package.json` (`playwright` 1.65.1 and `esbuild` exact devDependencies; script `"test:engines": "tsx scripts/cross-engine.ts"`), `CLAUDE.md`, `.claude/skills/piece-contract/SKILL.md`, `.claude/skills/new-piece/SKILL.md`, `.claude/skills/seeded-randomness-and-determinism/SKILL.md`.

**Interfaces — Produces:**
```ts
/** Recording fake 2D context: every method call and property set appended as text (numbers via String(n)). */
export function recordingContext(): { ctx: CanvasRenderingContext2D; hash(): string };
/** Engine-neutral 64-bit hash (two 32-bit FNV-1a lanes using Math.imul), hex. No crypto. */
export function hashText(s: string): string;
/** For every registered piece version × (featured ∪ snapshotCodes): run min(total, 2000) steps (endless: 2000) through createRunner on a recording context; interactive pieces also with a fixed synthetic log. Returns { '<slug>@v<N>:<code>[+input]': hash }. */
export function runProbe(): Record<string, string>;
```

`scripts/cross-engine.ts`: bundle `probe.ts` with esbuild (IIFE, `globalThis.runProbe`), run it in Node, then in Playwright **WebKit** and **Firefox** (`page.addScriptTag`), diff the maps, print each mismatch, exit 1 on any. If browsers are missing, print `npx playwright install webkit firefox` and exit 2. (Chromium is skipped: same V8 as Node.)

- [ ] **Step 1: Failing tests:** `hashText` known vectors (pin `hashText('')` and `hashText('abc')`); probe returns stable hashes across two runs; a fake piece using a value that differs per call order changes the hash.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; run `npx playwright install webkit firefox`, then `npm run test:engines` → all engines match (report the output).
- [ ] **Step 4:** Docs: CLAUDE.md (live mode, captures, `/c/<id>`, env `BLOB_READ_WRITE_TOKEN`, `.captures/` dev store, `npm run test:engines`, the runner's additive input parameter); piece-contract skill (endless/interactive, `InputFrame` semantics, quantized pointer, `loopSteps` multiple of 4); new-piece (featured `n` codes for endless pieces, interactive testing); determinism skill (cross-engine check). `npm test`, lint, build green.
- [ ] **Step 5: Checkpoint.**
