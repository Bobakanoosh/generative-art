@AGENTS.md

# Generative art portfolio

A Next.js site that shows deterministic, versioned, canvas-drawn generative pieces. Each piece is a pure function of (version, seed, params, steps); the server renderer (`@napi-rs/canvas`) is canonical, and the browser draws the same thing live. A share code `?g=<code>` (base64url JSON `{ v, s, p, n? }`) reproduces any image exactly.

## Rules
- **Never commit (or `git add`, push, etc.) without the artist's explicit permission.** Leave changes uncommitted and report.
- Deployed piece versions are frozen. Change behaviour with a new `v<N+1>`, never an edit. Also frozen (they define what existing share codes mean): `src/lib/art/*`, the runner, `validateParams` in `src/lib/piece/schema.ts`, and the decode rules in `src/lib/piece/share.ts` (canonical base64url, no BOM, only keys `v s p n`, `n <= MAX_STOP_STEP`).
- Pieces live in `src/pieces/<slug>/v<N>/index.ts` and must be deterministic: no `Math.random`, transcendental `Math.*`, `Date`, `performance`, `crypto`, or `getImageData` (lint enforces it, including via `globalThis.`/`window.`). Use `@/lib/art/*`.
- Logical drawing space is 1000 wide, `1000 / aspect` tall; fixed timestep `DT = 1/60`.
- Import registry functions from `@/pieces`, not `@/lib/piece/registry`.
- Pieces with `local: true` are hidden in production.

## Commands
- `npm run dev` - dev server (does not generate thumbnails)
- `npm test` - vitest, including per-piece snapshot hashes (`UPDATE_SNAPSHOTS=1 npm test` to record; PowerShell: `$env:UPDATE_SNAPSHOTS=1; npm test`)
- `npm run lint` - eslint, including the determinism bans
- `npm run thumbs` - render `public/thumbs/` from featured codes (runs automatically on `prebuild`)
- `npm run build` / `npm start` - production build and server

URLs: `/art/<slug>?g=<code>` page; `/art/<slug>/print?g=<code>` print page; `/api/render?slug=&g=&w=` PNG (default 1200 px wide; clamped so the long edge is at most 4096 px and the image at most 4096² pixels).

## Playback, video, print
- Player (`PlayerBar`): builds play back over about 10 s at 1x (ease `t^1.6`), speeds 0.5x/1x/2x/Instant, scrub/seek, `phases` ticks. Pacing is viewer-only; the final image equals the instant render.
- Video export (`VideoExport`): MP4 (WebM where H.264 can't be encoded) at 30 fps, 1080 px long edge; GIF at 15 fps, 540 px. Both 8 s build + 2 s hold, rendered frame-locked.
- Print (`/art/<slug>/print`): paper sizes letter, a4, a3, 8x10, 11x14, 12x16, 18x24; 300 DPI tiles (max 2048 px edge), 0.5 in margin, optional caption (default on).
- Layout: `src/lib/playback` (pacing, seek, speed preference, playback loop), `src/lib/video` (frame plan, encode), `src/lib/print` (paper layout, tiles); UI in `src/app/art/[slug]/` (`PlayerBar.tsx`, `VideoExport.tsx`, `print/`).

## Skills (`.claude/skills/`)
- `piece-contract` - the `PieceDefinition` interface and param schema
- `seeded-randomness-and-determinism` - banned APIs, rng, noise, pitfalls
- `new-piece` - scaffold, register, iterate, featured codes, snapshots
- `publish-piece` - release checklist (`local` removal, lint, snapshots, thumbs, build)
- `new-version` - evolve a deployed piece safely

## Docs
Design spec: `docs/superpowers/specs/2026-11-19-generative-art-portfolio-design.md`. Reference piece: `src/pieces/flow-ribbons/v1`.
Coming in later plans: endless and interactive pieces and captures (Plan 3), design pass and deploy (Plan 4).
