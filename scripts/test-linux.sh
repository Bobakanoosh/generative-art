#!/usr/bin/env bash
# Run the snapshot suites on Linux (production renders there). node_modules lives
# in a named volume so the host install is untouched.
set -euo pipefail
MSYS_NO_PATHCONV=1 docker run --rm \
  -e UPDATE_SNAPSHOTS="${UPDATE_SNAPSHOTS:-}" \
  -v "$PWD":/app -w /app -v gen-art-linux-nm:/app/node_modules \
  node:22-bookworm bash -lc "npm ci && npx vitest run tests/snapshots.test.ts src/pieces"
