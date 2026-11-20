<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working rules

- **Always add tests for code.** Every behaviour change or new code path ships with tests that cover it (write the failing test first where practical). Run `npm test` and `npm run lint` before reporting work as done.
- **Always validate changes in a real browser via `agent-browser`.** After any change that affects what users see or do, start the dev server, open the affected pages with the `agent-browser` skill, exercise the change (click, type, navigate, back/forward), and check the console for errors. Tests passing is not enough — report what you saw in the browser.
