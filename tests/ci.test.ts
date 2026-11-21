import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ci = readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');

describe('CI workflow', () => {
  it('has a read-only token', () => {
    expect(ci).toMatch(/^permissions:\n {2}contents: read$/m);
  });
  it('runs on pull requests and on pushes to main only', () => {
    expect(ci).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:$/m);
  });
  it('lints, tests and builds', () => {
    for (const step of ['npm ci', 'npm run lint', 'npm test', 'npm run build']) expect(ci).toContain(`- run: ${step}`);
  });
});
