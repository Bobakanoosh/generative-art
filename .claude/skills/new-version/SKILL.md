---
name: new-version
description: How to evolve a deployed generative piece by creating v<N+1> instead of editing v<N> - copy the folder, bump version, register both, new snapshots. Use when the artist says "change a published piece", "new version", "v2", "tweak the algorithm", "fix a bug in a piece", or when a toolkit change in src/lib/art would alter output.
---

# New version of a piece

A deployed `v<N>` is **frozen**: share codes, prints, and OG images reference it by `v`. If its output must change in any way (algorithm, defaults, schema ranges, rng call order, even a fix), make `v<N+1>`. Never commit without the artist's explicit permission.

## Steps
1. Copy the folder (leave the old one untouched):
   - `cp -r src/pieces/<slug>/v1 src/pieces/<slug>/v2` (PowerShell: `Copy-Item -Recurse src/pieces/<slug>/v1 src/pieces/<slug>/v2`)
2. In `v2/index.ts`: set `version: 2`, add `local: true` while iterating, update the header comment. Delete `v2/snapshots.json` (it holds v1's hashes).
3. Reset `featured` (and `snapshotCodes`): v1 codes have `"v":1` and will render with v1. Choose new codes for v2 (see `new-piece` step 4). You may keep some v1 codes in v1 only. `npm test` fails while any registered version has an empty `featured` (the snapshot test asserts `featured.length > 0`), so add at least one v2 code before running tests or recording snapshots.
4. Register **both** in `src/pieces/index.ts`:
   ```ts
   import flowRibbonsV1 from './flow-ribbons/v1';
   import flowRibbonsV2 from './flow-ribbons/v2';
   const PIECES = [flowRibbonsV1, flowRibbonsV2] as PieceDefinition[];
   ```
   `getPiece(slug)` returns the latest visible version; old links with `v:1` keep resolving to v1. A duplicate slug+version throws at registration.
5. Record new snapshots for v2 (`UPDATE_SNAPSHOTS=1 npm test`; PowerShell `$env:UPDATE_SNAPSHOTS=1; npm test`), then `npm test`. **v1's snapshots must not change** - if v1's hash test fails, you modified something v1 depends on.
6. Publish with `publish-piece` (remove `local`, thumbs, build).

## Toolkit changes
Anything v1 imports (`src/lib/art/math|rng|noise|color`, runner, share) is part of v1. Also frozen, because they decide what a share code means: `validateParams` in `src/lib/piece/schema.ts` (how stored params are clamped, snapped, defaulted) and the decode rules in `src/lib/piece/share.ts` (`decodeGeneration`: canonical base64url only, strict UTF-8 without BOM, only keys `v s p n`, `0 <= n <= MAX_STOP_STEP`). Loosening or tightening either changes which links work or what they draw. If you must improve a toolkit function and the output of any existing version would change, **add a new function with a new name** (for example `smoothstep2`) and use it only from the new version; leave the old function byte-for-byte as is. After any toolkit edit run `npm test`: all existing snapshots must still match.

## Never
- Edit files under a deployed `v<N>/` (including "harmless" refactors - they can shift float or rng order).
- Reuse a version number or change what a share code means.
- Delete an old version folder; old links must keep working.
