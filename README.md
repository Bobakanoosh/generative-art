# Generative Art

A portfolio of deterministic, canvas-drawn generative art by [Jack Englund](https://jackenglund.com).

**Live site: [generative.jackenglund.com](https://generative.jackenglund.com)**

Each piece is a pure function of `(version, seed, params, steps)`. The browser draws it live, and the server renders the same image down to the pixel. A short share code (`?g=…`) reproduces any image exactly, whether as a PNG, a video, or a print.

## Tech stack

- **Next.js 16** (App Router) with **React 19** and **TypeScript**
- **Tailwind CSS 4** with a small token-based design system
- **HTML Canvas 2D** in the browser; **@napi-rs/canvas** for server-side rendering (OG images, PNG export, print tiles)
- **Mediabunny** (MP4/WebM) and **gifenc** (GIF) for in-browser video export
- **Vercel** for hosting (Fluid Compute functions, CDN caching) and **Vercel Blob** for saved captures
- **Vitest** and **Testing Library** for tests; **Playwright** for cross-engine checks

## Highlights

- **Deterministic by construction.** Seeded RNG and deterministic math helpers, with ESLint rules that ban `Math.random`, `Date`, transcendental `Math.*` and similar APIs inside pieces.
- **Versioned pieces.** A published version is frozen, so old share links always mean the same image; changes ship as a new version.
- **Verified everywhere.** Snapshot hashes for every piece, a Linux Docker run (production is canonical), and a check that each simulation gives identical draw calls in V8, JavaScriptCore and SpiderMonkey.
- **Live and interactive pieces.** Endless simulations run at 60 steps/s; pointer and key input is recorded and replayed so a server render matches what the visitor saw.
- **Fast long renders.** Pieces whose old drawing fades out skip drawing for early steps, giving byte-identical output at a fraction of the cost.
- **Playback and export.** Scrubbable build player, MP4/GIF export, high-resolution PNGs, and print layouts at 300 DPI.

## Running locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit and snapshot tests
npm run lint    # includes the determinism rules
npm run build   # renders thumbnails, then builds
```

Pieces live in `src/pieces/<slug>/v<N>/`. See [`docs/deploy.md`](docs/deploy.md) for deployment.
