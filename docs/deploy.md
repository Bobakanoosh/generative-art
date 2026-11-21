# Deploying to Vercel

1. Create a Vercel project from the GitHub repository (framework: Next.js, defaults otherwise).
2. Environment variables:
   - `NEXT_PUBLIC_SITE_URL` - the canonical site URL (used for OG/link metadata).
   - `BLOB_READ_WRITE_TOKEN` - **required in production**. From a Vercel Blob store with **public** access (captures and cached capture PNGs live there). Without it captures are disabled and capture renders are uncached.
3. The render routes (`/api/render`, `/api/render/c/[id]`) export `maxDuration = 300` (Next route segment config, read by Vercel): 300 s is the function duration limit with fluid compute, on all plans. Keep fluid compute on. Long live-moment renders replay every step and take 1-2 minutes (murmuration at 100 000 steps: about 90 s at 1200 px on a dev machine), so the first view of such a capture's OG image or PNG is slow; after that it is cached (CDN, plus the Blob capture render cache).
4. Piece snapshots are canonical on Linux. Run `npm run test:linux` before releasing (needs Docker); CI runs the suite on ubuntu-latest.

## First-deploy smoke checklist

- Gallery loads and thumbnails show.
- Open both pieces; change params, play, scrub.
- Capture: save a capture, open `/c/<id>`, and fetch `/api/render/c/<id>`.
- OG image: paste a piece link and a `/c/<id>` link into a link-preview checker.
- Print page: `/art/<slug>/print?g=<code>` renders tiles.

## Notes

- The capture rate limiter is in memory per serverless instance, so it is best-effort only. The client IP comes from `x-vercel-forwarded-for`, then `x-real-ip`; `x-forwarded-for` is not trusted.
- `?w=` on render routes snaps up to a width ladder (256, 400, 640, 800, 1200, 1600, 2400, 3200, 4096), so the response can be wider than requested. The snapping only dedupes the renders; the CDN still keys on the URL, so every distinct raw `?w=` value (e.g. `w=1001`, `w=1002`) is its own cache entry and its own first render. The app only ever requests ladder widths, so this matters only for hand-made or hostile URLs.
- PNG downloads of long live moments ask for smaller widths (4096 up to step 20 000, 2400 up to 50 000, then 1200) to keep the replay well inside the 300 s function limit (measured worst cases: 1200 px at 100 000 steps about 90 s, 2400 px at 50 000 about 70 s, 4096 px at 20 000 about 53 s; `npm run test:slow` budgets 150 s each).
