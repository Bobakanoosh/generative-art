---
name: publish-piece
description: Checklist to take a local generative piece to production - remove local flag, lint, record and verify snapshots, thumbnails, build; explains that a deployed version is frozen. Use when the artist says "publish", "ship", "deploy", "release this piece", or "make it public".
---

# Publish a piece

Nothing here commits or pushes. **Never `git commit` without the artist's explicit permission**; stop at a green checklist and report.

Production (`NODE_ENV=production`, i.e. `next build`/`start`) treats versions with `local: true` as nonexistent: `getPiece` and `listPieces` skip them, so they have no gallery tile, page, or render API. Publishing means removing that flag.

## Checklist
1. In `src/pieces/<slug>/v<N>/index.ts`: delete `local: true`. Confirm `featured` has the final share codes (3 or so, each with `v` = `version`) and the piece is registered in `src/pieces/index.ts`.
2. `npm run lint` - no banned APIs, no errors.
3. Record snapshot hashes, then verify:
   - bash: `UPDATE_SNAPSHOTS=1 npm test` then `npm test`
   - PowerShell: `$env:UPDATE_SNAPSHOTS=1; npm test`, then `Remove-Item Env:UPDATE_SNAPSHOTS; npm test`

   Review the diff of `src/pieces/<slug>/v<N>/snapshots.json`. If you did not intend a visual change, a hash change means determinism broke - find out why instead of regenerating.
4. `npm run thumbs` - renders `public/thumbs/<slug>-v<N>-<hash>.png` for each featured code (use `-- --force` to re-render). `npm run build` also runs it via `prebuild`.
5. `npm run build` - must succeed. Optional check that production lists the piece: after build, `NODE_ENV=production npx tsx -e "import('./src/pieces').then(m=>console.log(m.listPieces().map(p=>p.slug)))"`.
6. Smoke test: `npm start`, open `/art/<slug>?g=<featured code>` and `/api/render?slug=<slug>&g=<code>&w=800`.
7. Share URL format for the artist: `/art/<slug>?g=<code>`. The render API takes `slug`, `g`, and `w` (px, default 1200; clamped so the long edge is at most 4096 px and the image at most 4096² pixels, e.g. a 4:5 piece maxes out at 3277 × 4096).

## After deploy: frozen
Once a version is deployed, **its folder is never edited again** - every share code, print, and gallery link depends on it rendering identically. Changes mean a new version (`new-version`).

## Open item: platform-dependent hashes
Snapshot hashes were recorded on Windows. The canvas backend may rasterize differently on Linux, so CI (or a Vercel build, if tests are ever run there) may report different hashes for the same pixels. Do not "fix" this by regenerating on one platform and committing blindly; flag it to the artist. The twice-render-identical test is platform independent.

## Coming later
Endless and interactive pieces, capture links, video and print routes land in Plans 2 and 3; this checklist will gain steps then.
