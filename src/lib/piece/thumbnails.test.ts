import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRegistryForTests, registerPieces } from './registry';
import type { PieceDefinition } from './types';
import murmuration from '@/pieces/murmuration/v1';
import { decodeGeneration, encodeGeneration } from './share';
import { galleryGroups, galleryHref, galleryItems, thumbnailPath } from './thumbnails';

function fake(slug: string, featured: string[], local = false): PieceDefinition {
  return {
    slug, version: 2, title: `T ${slug}`, aspect: 1, schema: {}, featured, local,
    setup: () => ({}), step: () => {}, steps: () => 1,
  };
}

describe('thumbnailPath', () => {
  it('is stable and URL-safe', () => {
    const a = thumbnailPath('flow-ribbons', 1, 'abc_-DEF');
    expect(a).toBe(thumbnailPath('flow-ribbons', 1, 'abc_-DEF'));
    expect(a).toMatch(/^\/thumbs\/flow-ribbons-v1-[0-9a-f]{12}\.png$/);
    expect(thumbnailPath('flow-ribbons', 1, 'other')).not.toBe(a);
  });
  it('matches the known sha256 prefix', () => {
    // sha256("abc") = ba7816bf8f01cfea...
    expect(thumbnailPath('s', 3, 'abc')).toBe('/thumbs/s-v3-ba7816bf8f01.png');
  });
});

describe('galleryItems', () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerPieces([fake('a', ['c1', 'c2']), fake('b', ['c3'], true), fake('c', [])]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns one item per featured code', () => {
    const items = galleryItems();
    expect(items.map((i) => i.code)).toEqual(['c1', 'c2', 'c3']);
    expect(items[0]).toEqual({
      slug: 'a', title: 'T a', code: 'c1', aspect: 1,
      thumb: thumbnailPath('a', 2, 'c1'), href: '/art/a?g=c1',
    });
  });
  it('excludes local pieces in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(galleryItems().map((i) => i.slug)).toEqual(['a', 'a']);
  });
});

describe('galleryHref', () => {
  const live = (over: Partial<PieceDefinition> = {}): PieceDefinition => ({
    ...fake('l', []),
    version: 1,
    schema: { total: { kind: 'integer', default: 0, min: 0, max: 10, label: 'Total' } },
    setup: (p) => p.total,
    steps: (t) => ((t as number) ? (t as number) : Infinity),
    ...over,
  });
  const momentCode = encodeGeneration({ v: 1, s: 'seed-1', p: { total: 0 }, n: 2400 });

  it('opens a live (endless) piece running live: the featured code minus n', () => {
    expect(galleryHref(live(), momentCode)).toBe(`/art/l?g=${encodeGeneration({ v: 1, s: 'seed-1', p: { total: 0 } })}`);
  });
  it('opens an interactive piece live too', () => {
    const code = encodeGeneration({ v: 1, s: 'x', p: { total: 4 }, n: 3 });
    expect(galleryHref(live({ interactive: true }), code)).toBe(
      `/art/l?g=${encodeGeneration({ v: 1, s: 'x', p: { total: 4 } })}`,
    );
  });
  it('keeps the code of a build piece (even with n) and of a code without n', () => {
    const finite = encodeGeneration({ v: 1, s: 'x', p: { total: 4 }, n: 3 });
    expect(galleryHref(live(), finite)).toBe(`/art/l?g=${finite}`);
    const noN = encodeGeneration({ v: 1, s: 'x', p: { total: 0 } });
    expect(galleryHref(live(), noN)).toBe(`/art/l?g=${noN}`);
  });
  it('the real murmuration gallery tiles open live, with thumbnails of the featured moment', () => {
    __resetRegistryForTests();
    registerPieces([murmuration as PieceDefinition]);
    const items = galleryItems();
    expect(items.length).toBe(murmuration.featured.length);
    for (const [k, item] of items.entries()) {
      const featured = decodeGeneration(murmuration.featured[k])!;
      const opened = decodeGeneration(new URL(item.href, 'http://x').searchParams.get('g')!)!;
      expect(opened).toEqual({ v: featured.v, s: featured.s, p: featured.p });
      expect(item.thumb).toBe(thumbnailPath('murmuration', 1, murmuration.featured[k]));
    }
  });
});

describe('galleryGroups', () => {
  const three = (slug: string, local = false) => ({ ...fake(slug, [`${slug}1`, `${slug}2`, `${slug}3`], local), description: `D ${slug}` });
  beforeEach(() => {
    __resetRegistryForTests();
    registerPieces([three('a'), three('b', true), fake('c', ['c1', 'c2']), { ...three('d'), description: undefined, aspect: 0.8 }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns one group per listed piece, in listPieces order, featured[0] as primary', () => {
    const groups = galleryGroups();
    expect(groups.map((g) => g.slug)).toEqual(['a', 'b', 'd']);
    const [a] = groups;
    expect(a).toEqual({
      slug: 'a', title: 'T a', description: 'D a', aspect: 1, version: 2,
      primary: { slug: 'a', title: 'T a', code: 'a1', aspect: 1, thumb: thumbnailPath('a', 2, 'a1'), href: '/art/a?g=a1' },
      followUps: [
        { slug: 'a', title: 'T a', code: 'a2', aspect: 1, thumb: thumbnailPath('a', 2, 'a2'), href: '/art/a?g=a2' },
        { slug: 'a', title: 'T a', code: 'a3', aspect: 1, thumb: thumbnailPath('a', 2, 'a3'), href: '/art/a?g=a3' },
      ],
    });
    expect(groups[2].description).toBeUndefined();
    expect(groups[2].aspect).toBe(0.8);
  });
  it('items are exactly the galleryItems of each piece (same href/thumb logic)', () => {
    const flat = galleryGroups().flatMap((g) => [g.primary, ...g.followUps]);
    expect(flat).toEqual(galleryItems().filter((i) => i.slug !== 'c'));
  });
  it('omits a piece without three featured codes (only possible for a local draft)', () => {
    expect(galleryGroups().some((g) => g.slug === 'c')).toBe(false);
  });
  it('excludes local pieces in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(galleryGroups().map((g) => g.slug)).toEqual(['a', 'd']);
  });
  it('murmuration group opens live with thumbnails of the featured moments', () => {
    __resetRegistryForTests();
    registerPieces([murmuration as PieceDefinition]);
    const [g] = galleryGroups();
    expect(g.primary.code).toBe(murmuration.featured[0]);
    expect(g.followUps.map((i) => i.code)).toEqual(murmuration.featured.slice(1, 3));
    expect(decodeGeneration(new URL(g.primary.href, 'http://x').searchParams.get('g')!)!.n).toBeUndefined();
  });
});
