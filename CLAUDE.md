@AGENTS.md

# Generative art portfolio

A Next.js site that shows deterministic, versioned, canvas-drawn generative pieces. Each piece is a pure function of (version, seed, params, steps); the server renderer (`@napi-rs/canvas`) is canonical, and the browser draws the same thing live. A share code `?g=<code>` (base64url JSON `{ v, s, p, n? }`) reproduces any image exactly.

## Rules
- **Never commit (or `git add`, push, etc.) without the artist's explicit permission.** Leave changes uncommitted and report.
- Deployed piece versions are frozen. Change behaviour with a new `v<N+1>`, never an edit. Also frozen (they define what existing share codes mean): `src/lib/art/*`, the runner (frozen except the additive optional `input` parameter), `validateParams` in `src/lib/piece/schema.ts`, and the decode rules in `src/lib/piece/share.ts` (canonical base64url, no BOM, only keys `v s p n`, `n <= MAX_STOP_STEP`).
- Pieces live in `src/pieces/<slug>/v<N>/index.ts` and must be deterministic: no `Math.random`, transcendental `Math.*`, `Date`, `performance`, `crypto`, or `getImageData` (lint enforces it, including via `globalThis.`/`window.`). Use `@/lib/art/*`.
- Logical drawing space is 1000 wide, `1000 / aspect` tall; fixed timestep `DT = 1/60`.
- Import registry functions from `@/pieces`, not `@/lib/piece/registry`.
- Pieces with `local: true` are hidden in production.

## Commands
- `npm run dev` - dev server (does not generate thumbnails)
- `npm test` - vitest, including per-piece snapshot hashes (`UPDATE_SNAPSHOTS=1 npm test` to record; PowerShell: `$env:UPDATE_SNAPSHOTS=1; npm test`)
- `npm run test:slow` - long-running tests (`*.slow.test.ts`, e.g. murmuration's 100 000-step render must finish in under 60 s), excluded from `npm test` and run one file at a time; run it before publishing a piece or changing a live piece's step cost
- `npm run lint` - eslint, including the determinism bans
- `npm run test:linux` - snapshot suites inside Docker (node:22 Linux, node_modules in a named volume); Linux is canonical for production
- `npm run test:engines` - runs every piece's simulation in Node, WebKit and Firefox and compares draw-call hashes (needs `npx playwright install webkit firefox`; exit 1 on mismatch, 2 if browsers are missing; not part of `npm test`)
- `npm run thumbs` - render `public/thumbs/` from featured codes (runs automatically on `prebuild`)
- `npm run build` / `npm start` - production build and server

URLs: `/art/<slug>?g=<code>` page; `/art/<slug>/print?g=<code>` print page; `/api/render?slug=&g=&w=` PNG (default 1200 px wide; `w` snaps up to the width ladder 256/400/640/800/1200/1600/2400/3200/4096 in `src/lib/render/widthLadder.ts`, then is clamped so the long edge is at most 4096 px and the image at most 4096² pixels). Download PNG asks for 4096, except a live moment: 2400 past step 20 000, 1200 past 50 000 (`src/lib/render/downloadWidth.ts`).

## Playback, video, print
- Player (`PlayerBar`): builds play back over about 10 s at 1x (ease `t^1.6`), speeds 0.5x/1x/2x/Instant, scrub/seek, `phases` ticks. Pacing is viewer-only; the final image equals the instant render.
- Video export (`VideoExport`): MP4 (WebM where H.264 can't be encoded) at 30 fps, 1080 px long edge; GIF at 15 fps, 540 px. Both 8 s build + 2 s hold, rendered frame-locked.
- Print (`/art/<slug>/print`): paper sizes letter, a4, a3, 8x10, 11x14, 12x16, 18x24; 300 DPI tiles (max 2048 px edge), 0.5 in margin, optional caption (default on).
- Layout: `src/lib/playback` (pacing, seek, speed preference, playback loop), `src/lib/video` (frame plan, encode), `src/lib/print` (paper layout, tiles); UI in `src/app/art/[slug]/` (`PlayerBar.tsx`, `VideoExport.tsx`, `print/`).

## Live pieces and captures
- Endless pieces (`steps` = `Infinity`) and interactive pieces (`interactive: true`, pointer/keys in `input`) run live in the browser at 60 steps/s (`src/lib/live`, `LiveCanvas`, `LiveBar`); the sim stops at `MAX_STOP_STEP`. A share code for an endless piece must carry `n`.
- Input is recorded as an `InputLog` (`src/lib/input`, pointer quantized to `qx = x * 10` ints, keys) and replayed by the runner's optional `input` parameter, so a server render reproduces what the visitor saw.
- Captures (`src/lib/capture`): the Capture dialog saves `{ gen, input }` and returns `/c/<id>` (id = first 12 chars of base64url sha256). `POST /api/captures` saves (body at most 768 KiB, which fits the largest 30 000-event log; rate limited per IP); `/api/render/c/<id>?w=` renders the PNG (503, not 404, when storage fails). Storage is Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, else the local `.captures/` directory (dev; gitignored).
- Capture rate limiter (`src/lib/capture/rateLimit.ts`, 10 saves per IP per 10 minutes) is in memory, per server instance (each serverless instance has its own count), and keys on the first `x-vercel-forwarded-for` entry, then `x-real-ip` (never `x-forwarded-for`, which a client can spoof). Both are set by the platform on Vercel; elsewhere make sure the proxy sets `x-real-ip` itself, or every visitor shares the `unknown` bucket.
- Links: a live piece's link without `n` (or with `n = 0`) opens running live; with `n` it is a captured moment (a build to `n`). Gallery tiles of live pieces open live (the featured code minus `n`), and the OG image of a live link without `n` is the first featured code.
- Long live renders are slow: a server render (OG image, `/api/render`, capture PNG, print tile) of a moment near `MAX_STOP_STEP` replays every step (murmuration at 100 000 steps and 1500 birds on a dev machine: ~30 s at 100 px, ~90 s at 1200 px, since the trail veil is a full-canvas fill per step). The render routes export `maxDuration = 300` (Vercel fluid-compute limit); `npm run test:slow` budgets 150 s per case (half the limit, for slower hardware). Renders are cached (CDN + capture render cache) and long-moment downloads are smaller, but the first view of a very long moment's OG image or PNG takes 1-2 minutes; that render cost is still open.
- Live video clips (`src/lib/video/liveClip.ts`, `LiveVideoExport`): 5/10/15 s from the current step; `loopSteps` must be a positive multiple of 4.
- Cross-engine: a piece's simulation must give identical draw calls in V8, JavaScriptCore and SpiderMonkey; `npm run test:engines` checks it (`src/lib/determinism/probe.ts`).

## Design system
- Direction: dark-only gallery wall. The art is the only colour on the page; chrome is quiet, neutral and square.
- Tokens: `src/app/globals.css` (`@theme` colours such as `bg`, `surface`, `fg`, `muted`, `faint`, `line`, `line-strong`; type utilities such as `ui-label`). Use the tokens, never raw palette colours (`zinc-*`, hex) in components.
- Primitives: `src/components/ui` (`Button`, `IconButton`, `Icon`, `Menu`, `Dialog`, `SiteHeader`). Param controls: `src/components/controls` (`Slider`, `NumberInput`, `Toggle`, `Segmented`, `Chips`, `ColorSwatch`, `PaletteEditor`, `Field`).
- Layout: `PieceLayout` (stage + settings panel) and `artFrame` (canvas fit) in `src/app/art/[slug]/`.

## Skills (`.claude/skills/`)
- `piece-contract` - the `PieceDefinition` interface and param schema
- `seeded-randomness-and-determinism` - banned APIs, rng, noise, pitfalls
- `new-piece` - scaffold, register, iterate, featured codes, snapshots
- `publish-piece` - release checklist (`local` removal, lint, snapshots, thumbs, build)
- `new-version` - evolve a deployed piece safely
- `flow-fields` - flow-field technique: curl vs angle fields, seeding, trails, veil fade, pointer forces

## Docs
Design spec: `docs/superpowers/specs/2026-11-19-generative-art-portfolio-design.md`. Reference piece: `src/pieces/flow-ribbons/v1`. Deploying: `docs/deploy.md`.
Still open: the server render cost of very long live moments (see above).
