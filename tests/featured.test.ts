import { describe, expect, it } from 'vitest';
import { allVersions, getPiece, listPieces } from '@/pieces';
import { decodeGeneration, encodeGeneration } from '@/lib/piece/share';
import { galleryGroups } from '@/lib/piece/thumbnails';

// The gallery shows each published piece as a group of three: featured[0] is
// the primary, featured[1..2] the follow-ups.
describe('featured codes', () => {
  const published = allVersions().filter((p) => !p.local);

  it('there is at least one published piece', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  for (const piece of published) {
    describe(`${piece.slug} v${piece.version}`, () => {
      it('has exactly 3 featured codes', () => {
        expect(piece.featured).toHaveLength(3);
      });
      it('every featured code decodes, is canonical and matches the version', () => {
        for (const code of piece.featured) {
          const gen = decodeGeneration(code);
          expect(gen, `decodes: ${code}`).not.toBeNull();
          expect(encodeGeneration(gen!), `canonical: ${code}`).toBe(code);
          expect(gen!.v).toBe(piece.version);
        }
      });
      it('featured codes are unique', () => {
        expect(new Set(piece.featured).size).toBe(piece.featured.length);
      });
    });
  }

  it('the gallery and the piece page (no code) use the latest published version of every piece', () => {
    const latest = new Map<string, number>();
    for (const p of published) latest.set(p.slug, Math.max(latest.get(p.slug) ?? 0, p.version));
    expect(new Map(listPieces().map((p) => [p.slug, p.version]))).toEqual(latest);
    for (const [slug, version] of latest) expect(getPiece(slug)?.version).toBe(version);
    for (const g of galleryGroups()) expect(decodeGeneration(g.primary.code)!.v).toBe(latest.get(g.slug));
  });

  it('the gallery shows one group per listed piece', () => {
    const groups = galleryGroups();
    expect(groups.map((g) => g.slug)).toEqual(listPieces().map((p) => p.slug));
    for (const g of groups) {
      const p = listPieces().find((x) => x.slug === g.slug)!;
      expect(g.primary.code).toBe(p.featured[0]);
      expect(g.followUps.map((i) => i.code)).toEqual(p.featured.slice(1, 3));
    }
  });
});
