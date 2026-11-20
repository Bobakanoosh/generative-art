// Renders every featured generation to public/thumbs/. Run: npm run thumbs [-- --force]
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listPieces } from '@/pieces';
import { decodeGeneration } from '@/lib/piece/share';
import { renderPng } from '@/lib/render/server';
import { thumbnailPath } from '@/lib/piece/thumbnails';

const WIDTH = 800;
const force = process.argv.includes('--force');
const outDir = path.join(process.cwd(), 'public');

async function main() {
  let failed = false;
  let made = 0;
  let skipped = 0;
  for (const piece of listPieces()) {
    for (const code of piece.featured) {
      const gen = decodeGeneration(code);
      if (!gen) {
        console.error(`[thumbs] ${piece.slug}: featured code failed to decode: ${code.slice(0, 24)}...`);
        failed = true;
        continue;
      }
      const file = path.join(outDir, thumbnailPath(piece.slug, piece.version, code));
      if (!force && existsSync(file)) {
        skipped++;
        continue;
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, await renderPng(piece, gen, WIDTH));
      made++;
      console.log(`[thumbs] wrote ${path.relative(process.cwd(), file)}`);
    }
  }
  console.log(`[thumbs] ${made} rendered, ${skipped} skipped`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
