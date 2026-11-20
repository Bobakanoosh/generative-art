import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRegistryForTests, registerPieces } from './registry';
import type { PieceDefinition } from './types';
import { galleryItems, thumbnailPath } from './thumbnails';

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
