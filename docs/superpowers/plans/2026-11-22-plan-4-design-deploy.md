# Plan 4 — Design pass and deploy readiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site looks like a quiet, considered art gallery — grouped 3-up gallery per piece, refined config controls in an independently scrolling panel, consistent player/live/capture/print chrome — and is ready to deploy to Vercel (Linux-verified snapshots, CI, bounded render cost, trustworthy client IP), plus the first technique skill (`flow-fields`).

**Architecture:** A small design system (CSS tokens in `globals.css`, fonts via `next/font`, a handful of UI primitives in `src/components/ui/`) replaces ad-hoc Tailwind classes. Param controls become one component per param kind in `src/components/controls/`, all keyboard-accessible and built on native inputs styled custom. The gallery renders one group per piece from a new `galleryGroups()` data function. Deploy readiness is code + docs only; the actual Vercel deploy is the artist's action.

**Tech Stack:** existing Next.js 16 / React 19 / Tailwind 4 / Vitest; `next/font/google` (Instrument Serif + Geist + Geist Mono); Docker (`node:22-bookworm`) for the Linux snapshot check; GitHub Actions workflow file (not pushed).

**Spec:** `docs/superpowers/specs/2026-11-19-generative-art-portfolio-design.md` (sections "Config panel" incl. the 2026-11-20 artist request, "Gallery" incl. the 2026-11-20 request, "Anti-goals" — site chrome must not compete with the art, "Constraints", "Server render endpoint", "Skills library", "Left to the builder" → visual design direction: art-first, minimal, dark-friendly).

## Global Constraints

- **Never run `git commit`, `git add`, `git stash`, push, or anything that changes git state.** The artist approves commits per batch. Never deploy, never create Vercel/GitHub resources. Checkpoint = tests + lint pass, stop.
- **Frozen output:** `src/lib/art/*`, the runner (except its existing optional `input` param), `validateParams`, share-code decode rules, piece behaviour in `src/pieces/**`. Snapshot hashes must not change. Piece metadata (`featured` order) may not change either.
- Read `node_modules/next/dist/docs/` before writing Next.js code (Next 16, `cacheComponents: true`).
- Every code change ships with tests. Every user-visible change is validated with `agent-browser` at **1440×900 and 390×844**, with screenshots looked at, console checked (dev server on a free port you start and stop; never kill processes you did not start; port 3000 is taken).
- **Design direction (ruling):** dark-only "gallery wall". Tokens: `--bg #0d0c0b`, `--surface #151412`, `--line rgba(237,233,226,0.10)`, `--line-strong rgba(237,233,226,0.22)`, `--fg #ede9e2`, `--muted rgba(237,233,226,0.56)`, `--faint rgba(237,233,226,0.40)`, `--focus #ede9e2`; no brand accent colour (the art supplies colour). Type: titles in **Instrument Serif** (400, normal + italic), UI in **Geist** (13–14 px, labels 11 px uppercase tracking 0.08em), numbers/codes in **Geist Mono** with `tabular-nums`. Radius **2 px** max; hairline (1 px) borders; no shadows, no gradients except image scrims. Motion: 150–200 ms ease-out, disabled under `prefers-reduced-motion`.
- The art is always the largest, brightest thing on screen. Chrome never overlaps the canvas except transient overlays (hint, errors).
- Accessibility: every control reachable and operable by keyboard, visible focus ring (1 px `--focus` outline, 2 px offset), labels associated, contrast of text ≥ 4.5:1 against `--bg` (muted text ≥ 4.5:1 for body copy, `--faint` only for decorative/secondary metadata ≥ 3:1).
- Featured: every published piece has **exactly 3** featured codes; `featured[0]` is the primary.
- Site title constant `SITE_TITLE = 'Generative Art'` in `src/lib/site.ts` (the artist will rename it).

## Review Focus

1. **Controls lose behaviour while gaining looks** — slider live-drag vs commit (Plan 2 `sliderCommit`), number entry, palette editing, multiselect min count, keyboard steps. Task 3 keeps the existing ParamPanel tests passing and adds per-control tests.
2. **Panel scroll vs art** — on desktop the art stays fully in view while a long panel scrolls; on mobile the page scrolls naturally with the art first. Task 3 browser check at both sizes.
3. **Gallery with a piece that has a missing thumbnail or a portrait vs landscape vs square aspect** — group layout must not break or crop the primary. Task 2 test with mixed aspects + browser check.
4. **Linux snapshot hashes differ from Windows** — production renders on Linux; must be known before deploy. Task 6 runs the suite in Docker and records the outcome.
5. **Public render endpoints under repeated uncached requests** (arbitrary widths defeat the CDN cache; long live captures take ~35 s). Task 6 width ladder + capture render cache tests.

---

## File Structure

```
src/lib/site.ts                     SITE_TITLE, SITE_DESCRIPTION
src/app/globals.css                 tokens, base, focus, reduced motion (rewrite)
src/app/layout.tsx                  fonts, SiteHeader
src/components/ui/                  Button.tsx, IconButton.tsx, Icon.tsx (inline SVG set), Dialog.tsx, SiteHeader.tsx
src/components/controls/            Slider.tsx, NumberInput.tsx, Toggle.tsx, ColorSwatch.tsx, Segmented.tsx, Chips.tsx, PaletteEditor.tsx (+ tests)
src/app/art/[slug]/ParamPanel.tsx   (rewrite onto controls)
src/app/art/[slug]/ArtView.tsx      layout: art stage + panel
src/app/art/[slug]/{PlayerBar,LiveBar,CaptureDialog,VideoExport,LiveVideoExport}.tsx  (restyle)
src/app/art/[slug]/print/*, src/app/c/[id]/*, not-found pages (restyle)
src/lib/piece/thumbnails.ts         galleryGroups()
src/app/page.tsx                    grouped gallery
src/lib/render/widthLadder.ts       snapWidth
src/lib/capture/renderCache.ts      store-backed PNG cache for capture renders
src/lib/capture/rateLimit.ts        clientIp hardening
scripts/test-linux.sh + package.json script `test:linux`
.github/workflows/ci.yml            lint, test, build on ubuntu (file only)
docs/deploy.md                      Vercel checklist
.claude/skills/flow-fields/SKILL.md
```

---

### Task 1: Design foundation — tokens, fonts, primitives, header

**Files:** Create `src/lib/site.ts`, `src/components/ui/{Button,IconButton,Icon,Dialog,SiteHeader}.tsx` + `src/components/ui/ui.test.tsx`; Modify `src/app/globals.css`, `src/app/layout.tsx`. Add devDependencies `@testing-library/react` + `jsdom` (exact pins of current versions) if not present, with vitest `environment: 'jsdom'` set per test file (`// @vitest-environment jsdom`), not globally.

**Interfaces — Produces:**
```ts
export const SITE_TITLE = 'Generative Art';
export const SITE_DESCRIPTION: string;   // current layout metadata description
// Button: variant 'primary' (fg on bg inverted: bg --fg, text --bg) | 'quiet' (hairline border) | 'ghost' (text only); size 'sm' | 'md'; renders <a> when `href` given, else <button type="button">; forwards disabled/aria-*.
export function Button(props: ButtonProps): JSX.Element;
// IconButton: square 32 px (sm 28), requires `label` (aria-label + title).
export function IconButton(props: { icon: IconName; label: string; onClick?(): void; pressed?: boolean; disabled?: boolean; size?: 'sm' | 'md' }): JSX.Element;
export type IconName = 'play' | 'pause' | 'replay' | 'skip' | 'restart' | 'capture' | 'record' | 'stop' | 'download' | 'print' | 'link' | 'check' | 'close' | 'shuffle' | 'dice' | 'reset' | 'chevron-down' | 'arrow-left' | 'video';
export function Icon(props: { name: IconName; size?: number }): JSX.Element;   // 1.5 px stroke, currentColor, 20×20 viewBox, aria-hidden
// Dialog: native <dialog> with showModal, Esc closes, focus returns to opener, labelled by its title.
export function Dialog(props: { open: boolean; title: string; onClose(): void; children: React.ReactNode }): JSX.Element;
export function SiteHeader(): JSX.Element;   // wordmark SITE_TITLE in Instrument Serif linking '/', 56 px tall, hairline bottom border
```

- [ ] **Step 1: Failing tests** (jsdom): Button renders `<a href>` with href and `<button type="button">` without; disabled button not clickable; IconButton has `aria-label` and `title` = label and `aria-pressed` when `pressed` given; every IconName renders an `<svg aria-hidden="true">`; Dialog calls onClose on Escape and is labelled by its title.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; globals.css defines the tokens from Global Constraints as Tailwind 4 `@theme` colours (`bg`, `surface`, `line`, `line-strong`, `fg`, `muted`, `faint`) and font families (`serif`, `sans`, `mono`), base body styles, `:focus-visible` ring, `::selection`, reduced-motion rule; layout loads the three fonts, renders `SiteHeader`, uses `SITE_TITLE`/`SITE_DESCRIPTION` in metadata.
- [ ] **Step 4:** PASS + lint + build. Browser: header renders on `/`, `/art/flow-ribbons`, `/c/<id>`; no layout shift; console clean.
- [ ] **Step 5: Checkpoint.**

### Task 2: Gallery — one grouped set per piece

**Files:** Modify `src/lib/piece/thumbnails.ts` (+ test), `src/app/page.tsx`; Create `tests/featured.test.ts`.

**Interfaces — Produces:**
```ts
export interface GalleryGroup { slug: string; title: string; description?: string; aspect: number; version: number; primary: GalleryItem; followUps: [GalleryItem, GalleryItem] }
export function galleryGroups(): GalleryGroup[];   // listPieces() order; built on galleryItems' per-code logic (href/thumb unchanged)
```

Layout per group (desktop ≥ 1024 px): a 12-column grid; primary spans 8 columns, the two follow-ups stack in the remaining 4, top-aligned, sizes derived from the piece aspect so the group's right column never exceeds the primary's height (`object-fit: contain` on `--surface` if needed — never crop art). Below the images (or beside on wide screens — implementer's call, must read as one unit): title in Instrument Serif 32–40 px, description in muted Geist, small mono meta (`v1 · 3 variations`), and an "Open piece →" link to the primary's href. Mobile: primary full width, follow-ups as a 2-column row beneath, then the caption. Groups separated by generous vertical space (≥ 96 px desktop) and a hairline. Hover: follow-up/primary image brightens subtly (no zoom); the primary carries a quiet "Featured" label only for screen readers (visual prominence comes from size). Each image is a link with an accessible name: `"<title> — featured"` / `"<title> — variation 2"` / `"variation 3"`.

- [ ] **Step 1: Failing tests:** `galleryGroups()` returns one group per listed piece with `primary.code === featured[0]` and followUps = featured[1..2]; `tests/featured.test.ts`: every registered non-local piece has exactly 3 featured codes, all decodable, canonical, unique, version-matching.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + lint + build. Browser at both sizes: both pieces (portrait flow-ribbons 4:5, square murmuration) read as grouped units; keyboard tab order primary → follow-ups → open link; screenshots reviewed.
- [ ] **Step 5: Checkpoint.**

### Task 3: Config controls and the piece-page layout

**Files:** Create `src/components/controls/{Slider,NumberInput,Toggle,ColorSwatch,Segmented,Chips,PaletteEditor}.tsx` + `controls.test.tsx`; Rewrite `src/app/art/[slug]/ParamPanel.tsx` on them; Modify `ArtView.tsx` (layout + Actions restyle using `Button`).

**Interfaces — Produces:** each control `{ id, label, value, onChange(value, live?: boolean) }` plus kind-specific props:
- `Slider` (number/integer): custom-styled native `<input type=range>` — 1 px `--line-strong` track, filled portion `--fg`, 12 px round thumb (`--fg`), 24 px hit area; live while dragging, commit on release via existing `createSliderCommit` (keyboard arrows commit). Value shown right-aligned in Geist Mono as an editable `NumberInput` (no spinner arrows, Enter/blur commits, clamps, Esc reverts).
- `Toggle` (boolean): `role="switch"` button, 28×16 track.
- `ColorSwatch` (color): 24 px square swatch opening the native colour picker (visually hidden `<input type=color>`), hex in mono beside it.
- `Segmented` (select ≤ 4 options; else a styled native `<select>`): text options, selected one `--fg` with underline, others `--muted`.
- `Chips` (multiselect): toggle chips with `aria-pressed`; refuses to deselect below `minSelected` (shake-free: just disabled state + `title` explaining the minimum).
- `PaletteEditor` (palette): row of swatches (each a `ColorSwatch`), presets as thin 5-stop strips (`role="radio"` group), add/remove within min/max colours.

Panel: `lg:` fixed width 360 px column on the right, full viewport height below the header, `overflow-y: auto` with `overscroll-behavior: contain`, its own thin scrollbar; the art stage fills the rest, centred, sized to fit the viewport (art never scrolls out of view on desktop). Panel order: piece title (Instrument Serif 28 px) + description + mono meta (`v1 · seed abc123`), primary actions (Regenerate as `primary`, Randomize, Reset as `quiet`/IconButtons with labels), then param groups (group label 11 px uppercase `--faint`, hairline above), then secondary actions at the bottom (Copy link, Download PNG, Record video, Print) as quiet rows. Mobile: art first, player bar, then panel in normal flow. Each param row: label (13 px `--fg`) + description in `--muted` 12 px under it (only if present).

- [ ] **Step 1: Failing tests** (jsdom, per control): Slider emits live values during drag (input events) and exactly one commit on pointerup/change, arrow key commits; NumberInput clamps, Enter commits, Esc reverts; Toggle flips with Space/Enter and has `aria-checked`; Segmented arrow keys move selection; Chips cannot go below minSelected; PaletteEditor preset click sets the palette, add/remove respects min/max; existing `sliderCommit` and generationState tests still pass.
- [ ] **Step 2:** FAIL. **Step 3:** Implement.
- [ ] **Step 4:** PASS + lint + build. Browser at both sizes on `/art/flow-ribbons` and `/art/murmuration`: every control works by mouse and keyboard, dragging a slider redraws live and replays on release, the panel scrolls while the art stays put (desktop), screenshots reviewed against the direction.
- [ ] **Step 5: Checkpoint.**

### Task 4: Player, live bar, capture, video, print, capture page, not-found

**Files:** Modify `PlayerBar.tsx`, `LiveBar.tsx`, `CaptureDialog.tsx` (use `Dialog`), `VideoExport.tsx`, `LiveVideoExport.tsx`, `src/app/art/[slug]/print/*`, `src/app/c/[id]/*`, both `not-found.tsx`, `src/app/art/[slug]/page.tsx` placeholder (fix the deferred layout shift: the Suspense placeholder must have the same box as the loaded view).

Player bar: one 40 px row under the art, same width as the art: IconButtons (play/pause, replay), a 2 px progress track (`--line-strong`, played part `--fg`, phase ticks as 1 px marks, 16 px hit area, thumb appears on hover/focus/drag), time/step in mono `--muted`, speed as a compact text menu (`1×`), skip IconButton. Live bar: same row: a 6 px dot (`--fg`, gently pulsing at 2 s when live, static when paused; no pulse under reduced motion) + "Live"/"Paused" + elapsed mono, pause/play, restart, Capture as `Button quiet` with the capture icon, record menu; notices as a muted line beneath. Recording state: dot and label "Recording 7s" with Stop. Capture dialog: title "Moment captured", the link in mono in a read-only field, Copy (icon swaps to check for 1.5 s), Open, Resume. Print page: paper chooser as `Segmented`/select, caption toggle as `Toggle`, Print as `Button primary`, back link; print CSS unchanged. Capture page: same stage/panel layout as the piece page with a "Captured moment" eyebrow, actions panel (no params), "Open this piece live". Not-found: centred, Instrument Serif "Not found", one line, link home.

- [ ] **Step 1: Failing tests:** existing PlayerBar/LiveBar/CaptureDialog/VideoExport-related tests keep passing (update selectors only where markup changed, never weaken assertions); new: CaptureDialog Copy shows "Copied" state and returns focus on close; placeholder and loaded view share the same container sizing helper (pure function test).
- [ ] **Step 2:** FAIL (new tests). **Step 3:** Implement.
- [ ] **Step 4:** PASS + lint + build. Browser at both sizes: build page (play, scrub, speed, skip), live page (pause, restart, capture both kinds, record 5 s), capture page, print page (letter, caption toggle; print preview via headless PDF if feasible), not-found pages; no layout shift on load (compare placeholder vs loaded box); screenshots reviewed.
- [ ] **Step 5: Checkpoint.**

### Task 5: Design review pass

**Files:** whatever the critique requires, within the files touched by Tasks 1–4.

Run the `visual-design-critique` and `ux-patterns-analysis` skills against the running site (gallery, build piece, live piece, capture, print, mobile), judged against this plan's Design direction and the spec's anti-goal "site chrome competing with the art". Fix every issue rated high or medium; list low ones in the report.

- [ ] **Step 1:** Critique → findings list in the report (with screenshots paths).
- [ ] **Step 2:** Fix high/medium findings; tests for any behaviour change.
- [ ] **Step 3:** `npm test`, lint, build; re-screenshot the affected views.
- [ ] **Step 4: Checkpoint.**

### Task 6: Deploy readiness — Linux snapshots, CI, render cost, client IP, deploy doc

**Files:** Create `scripts/test-linux.sh`, `.github/workflows/ci.yml`, `docs/deploy.md`, `src/lib/render/widthLadder.ts` (+ test), `src/lib/capture/renderCache.ts` (+ test); Modify `package.json` (`"test:linux": "bash scripts/test-linux.sh"`), `src/lib/render/parseRenderRequest.ts`, `src/app/api/render/c/[id]/route.ts`, `src/lib/capture/rateLimit.ts` (+ test), `CLAUDE.md`.

**Interfaces — Produces:**
```ts
export const WIDTH_LADDER = [256, 400, 640, 800, 1200, 1600, 2400, 3200, 4096] as const;
/** Smallest ladder width >= requested (capped at 4096), then fitRenderWidth for the aspect. */
export function snapWidth(requested: number, aspect: number): number;
// renderCache.ts — capture PNGs are immutable per (id, width)
export function cachedCaptureRender(id: string, width: number, render: () => Promise<Buffer>, store?: PngStore | null): Promise<Buffer>;
export interface PngStore { get(key: string): Promise<Buffer | null>; put(key: string, png: Buffer): Promise<void> } // blob: `renders/<id>-<w>.png`; dev: `.captures/renders/`; none → render directly
// rateLimit.ts
export function clientIp(headers: Headers): string;  // x-vercel-forwarded-for → x-real-ip → 'unknown' (x-forwarded-for no longer trusted)
```

- `test-linux.sh`: `docker run --rm -v "$PWD":/app -w /app -v gen-art-linux-nm:/app/node_modules node:22-bookworm bash -lc "npm ci && npx vitest run tests/snapshots.test.ts src/pieces"` (node_modules in a named volume so the Windows install is untouched). Run it. **If any hash differs:** do not overwrite; record the differing codes in the report and apply this ruling — Linux is canonical (production renders there): store Linux hashes in `snapshots.linux.json` beside `snapshots.json`, and make the snapshot test pick the file by `process.platform` (`linux` → `.linux.json`, else the existing file); document in CLAUDE.md and the `publish-piece` skill that both must be recorded (`npm run test:linux` with `UPDATE_SNAPSHOTS=1`).
- `ci.yml`: on push/PR: ubuntu-latest, Node 22, `npm ci`, `npm run lint`, `npm test`, `npm run build`. (File only; do not push.)
- `/api/render` and `/api/render/c/[id]` use `snapWidth` (the response width may exceed the requested width by one ladder step; OG uses 1200 exactly, downloads 4096).
- `docs/deploy.md`: Vercel project from the GitHub repo; env `NEXT_PUBLIC_SITE_URL`, `BLOB_READ_WRITE_TOKEN` (Blob store, public access); function max duration ≥ 60 s for render routes; first-deploy smoke checklist (gallery, both pieces, capture save + `/c/<id>`, OG image via a link-preview checker, print); note that the per-instance rate limiter is best-effort.

- [ ] **Step 1: Failing tests:** `snapWidth(1, 1) === 256`, `snapWidth(1000, 1) === 1200`, `snapWidth(5000, 1) === 4096`, `snapWidth(1200, 0.8) === 1200` and respects `fitRenderWidth` for a very tall aspect; `cachedCaptureRender` renders once then serves from the store (memory PngStore), and with no store calls render every time; `clientIp` ignores `x-forwarded-for`, prefers `x-vercel-forwarded-for`, then `x-real-ip`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; run `npm run test:linux` and report its output verbatim (pass, or the mismatch handling above).
- [ ] **Step 4:** `npm test`, lint, build. **Step 5: Checkpoint.**

### Task 7: `flow-fields` technique skill and leftover cleanups

**Files:** Create `.claude/skills/flow-fields/SKILL.md` (+ optional `reference.md`); Modify `CLAUDE.md` (skills list); cleanups listed below with tests.

Skill: frontmatter `name: flow-fields`, description with triggers ("flow field", "noise field", "particles following a field", "curl noise", "streamlines", "ribbons"). Content distilled from `src/pieces/flow-ribbons/v1` and `src/pieces/murmuration/v1`: angle-from-noise vs curl-of-potential (divergence-free) fields, scale/octaves/turbulence, step size and DT, particle seeding (grid, jitter, bands), lifetimes and edge handling, trails via accumulation vs veil fades (8-bit veil stall below ~0.2 alpha and the every-m-steps workaround), density control, colour by angle/speed/palette, performance (typed arrays, field grids sampled every N steps, batched paths per colour), determinism rules (toolkit math only), and interactivity (pointer attract/repel). Include small code snippets that use `@/lib/art/*` APIs exactly as they exist (check signatures).

Cleanups (each with a test where behavioural):
1. `validateInputLog` normalizes `-0` to `0`; probe stringifies `-0` as `'-0'`.
2. `scripts/cross-engine.ts` treats only `Executable doesn't exist` as "browsers missing" (exit 2).
3. `src/lib/video/plan.ts` stops importing `@/lib/live/live` (move `LIVE_STEPS_PER_SECOND` to `src/lib/live/constants.ts`, re-exported from live.ts).
4. `parseWidth` duplication removed (the capture route uses the shared helper — may already be done by Task 6).
5. `loadCapture + getPiece + notFound` repeated in `/c/[id]` pages → one `loadCaptureOrNotFound(id)` helper.
6. Comment in `blobStore.put` documenting the "already exists" message dependency.

- [ ] **Step 1:** Write the skill; verify every API it names exists (grep) and every snippet type-checks (paste into a scratch `.ts` under the system temp dir importing from the repo, `npx tsc --noEmit` on it, then delete).
- [ ] **Step 2:** Cleanups with tests (RED/GREEN where behavioural).
- [ ] **Step 3:** `npm test`, lint, build, `npm run test:engines`. **Step 4: Checkpoint.**
