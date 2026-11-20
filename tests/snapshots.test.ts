import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allVersions } from '@/pieces';
import { decodeGeneration, encodeGeneration } from '@/lib/piece/share';
import { renderPng } from '@/lib/render/server';

const SNAPSHOT_WIDTH = 400;
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const repoRoot = path.resolve(__dirname, '..');

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

describe('piece snapshots', () => {
  const versions = allVersions();

  it('has at least one registered piece', () => {
    expect(versions.length).toBeGreaterThan(0);
  });

  for (const piece of versions) {
    const file = path.join(repoRoot, 'src', 'pieces', piece.slug, `v${piece.version}`, 'snapshots.json');

    describe(`${piece.slug} v${piece.version}`, () => {
      it('featured and snapshot-only codes match recorded snapshot hashes', async () => {
        expect(piece.featured.length).toBeGreaterThan(0);
        const codes = [...new Set([...piece.featured, ...(piece.snapshotCodes ?? [])])];
        const hashes: Record<string, string> = {};
        for (const code of codes) {
          const gen = decodeGeneration(code);
          expect(gen, `code decodes: ${code}`).not.toBeNull();
          expect(gen!.v).toBe(piece.version);
          expect(encodeGeneration(gen!), `code is canonical: ${code}`).toBe(code);
          hashes[code] = sha256(await renderPng(piece, gen!, SNAPSHOT_WIDTH));
        }
        if (UPDATE) {
          fs.writeFileSync(file, JSON.stringify(hashes, null, 2) + '\n');
          return;
        }
        expect(fs.existsSync(file), `missing ${file}; run with UPDATE_SNAPSHOTS=1`).toBe(true);
        const recorded = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
        expect(hashes).toEqual(recorded);
      }, 60_000);

      it('rendering the same code twice is byte-identical', async () => {
        const gen = decodeGeneration(piece.featured[0])!;
        const a = sha256(await renderPng(piece, gen, SNAPSHOT_WIDTH));
        const b = sha256(await renderPng(piece, gen, SNAPSHOT_WIDTH));
        expect(a).toBe(b);
      }, 60_000);
    });
  }
});
