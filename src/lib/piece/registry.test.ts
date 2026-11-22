import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PieceDefinition } from './types';
import {
  __resetRegistryForTests,
  allVersions,
  getPiece,
  latestVersion,
  listPieces,
  registerPieces,
  registerSlugAliases,
  renamedSlug,
} from './registry';

function fake(slug: string, version: number, local = false): PieceDefinition {
  return {
    slug,
    version,
    title: `${slug} v${version}`,
    aspect: 1,
    schema: {},
    featured: [],
    local,
    setup: () => ({}),
    step: () => {},
    steps: () => 1,
  };
}

describe('registry', () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerPieces([fake('demo', 1), fake('demo', 2)]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('resolves a renamed slug to the current piece, without listing it twice', () => {
    registerSlugAliases({ old: 'demo' });
    expect(renamedSlug('old')).toBe('demo');
    expect(renamedSlug('demo')).toBeUndefined();
    expect(getPiece('old')?.slug).toBe('demo');
    expect(getPiece('old', 1)?.version).toBe(1);
    expect(latestVersion('old')).toBe(2);
    expect(listPieces().map((p) => p.slug)).toEqual(['demo']);
    expect(() => registerSlugAliases({ demo: 'other' })).toThrow(/shadows/);
  });

  it('returns the latest version by default', () => {
    expect(getPiece('demo')?.version).toBe(2);
    expect(latestVersion('demo')).toBe(2);
  });
  it('returns a specific version', () => {
    expect(getPiece('demo', 1)?.version).toBe(1);
  });
  it('returns undefined for unknown slug/version', () => {
    expect(getPiece('nope')).toBeUndefined();
    expect(getPiece('demo', 9)).toBeUndefined();
    expect(latestVersion('nope')).toBeUndefined();
  });
  it('lists the latest version of each slug', () => {
    const list = listPieces();
    expect(list).toHaveLength(1);
    expect(list[0].version).toBe(2);
    expect(allVersions()).toHaveLength(2);
  });
  it('excludes local pieces in production only', () => {
    registerPieces([fake('wip', 1, true)]);
    expect(listPieces().map((p) => p.slug)).toContain('wip');
    vi.stubEnv('NODE_ENV', 'production');
    expect(listPieces().map((p) => p.slug)).not.toContain('wip');
    expect(allVersions().map((p) => p.slug)).toContain('wip');
  });
  it('throws on duplicate slug+version', () => {
    expect(() => registerPieces([fake('demo', 1)])).toThrow();
  });

  describe('published v1 + local v2', () => {
    beforeEach(() => {
      __resetRegistryForTests();
      registerPieces([fake('mix', 1), fake('mix', 2, true)]);
    });
    it('hides local v2 in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(latestVersion('mix')).toBe(1);
      expect(getPiece('mix')?.version).toBe(1);
      expect(getPiece('mix', 2)).toBeUndefined();
      expect(getPiece('mix', 1)?.version).toBe(1);
      expect(listPieces().map((p) => p.version)).toEqual([1]);
      expect(allVersions()).toHaveLength(2);
    });
    it('shows local v2 outside production', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(latestVersion('mix')).toBe(2);
      expect(getPiece('mix')?.version).toBe(2);
      expect(getPiece('mix', 2)?.version).toBe(2);
      expect(listPieces().map((p) => p.version)).toEqual([2]);
    });
    it('omits a slug with only local versions in production', () => {
      registerPieces([fake('wip', 1, true)]);
      vi.stubEnv('NODE_ENV', 'production');
      expect(listPieces().map((p) => p.slug)).toEqual(['mix']);
      expect(getPiece('wip')).toBeUndefined();
      expect(latestVersion('wip')).toBeUndefined();
    });
  });
});
