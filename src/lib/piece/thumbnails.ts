// Server-side only (node:crypto). Imported by the gallery server component and
// the build-time thumbnail script; never import from a client component.
import { createHash } from 'node:crypto';
import { isLive } from '@/lib/live/live';
import { listPieces } from '@/pieces';
import { decodeGeneration, encodeGeneration } from './share';
import type { PieceDefinition } from './types';

export interface GalleryItem {
  slug: string;
  title: string;
  code: string;
  aspect: number;
  thumb: string;
  href: string;
}

export function thumbnailPath(slug: string, version: number, code: string): string {
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
  return `/thumbs/${slug}-v${version}-${hash}.png`;
}

/**
 * Where a gallery tile opens: the featured code itself for a build piece. A
 * live (endless/interactive) piece opens running live, so its link drops the
 * stop step `n` (same version, seed and params); the thumbnail still shows the
 * featured moment.
 */
export function galleryHref(piece: PieceDefinition, code: string): string {
  const base = `/art/${piece.slug}?g=`;
  const gen = decodeGeneration(code);
  if (!gen || gen.n === undefined) return base + code;
  let live: boolean;
  try {
    live = isLive(piece, gen);
  } catch {
    live = false;
  }
  return base + (live ? encodeGeneration({ v: gen.v, s: gen.s, p: gen.p }) : code);
}

function itemFor(p: PieceDefinition, code: string): GalleryItem {
  return {
    slug: p.slug,
    title: p.title,
    code,
    aspect: p.aspect,
    thumb: thumbnailPath(p.slug, p.version, code),
    href: galleryHref(p, code),
  };
}

/** One tile per featured code of each listed piece. */
export function galleryItems(): GalleryItem[] {
  return listPieces().flatMap((p) => p.featured.map((code) => itemFor(p, code)));
}

/** A piece on the gallery wall: its primary image and two follow-ups. */
export interface GalleryGroup {
  slug: string;
  title: string;
  description?: string;
  aspect: number;
  version: number;
  primary: GalleryItem;
  followUps: [GalleryItem, GalleryItem];
}

/**
 * One group per listed piece (listPieces order): featured[0] is the primary,
 * featured[1..2] the follow-ups. Published pieces always have exactly three
 * featured codes (tests/featured.test.ts); a local draft with fewer is left
 * off the wall rather than shown as a broken group.
 */
export function galleryGroups(): GalleryGroup[] {
  return listPieces().flatMap((p) => {
    if (p.featured.length < 3) return [];
    const [primary, second, third] = p.featured.map((code) => itemFor(p, code));
    const group: GalleryGroup = {
      slug: p.slug,
      title: p.title,
      aspect: p.aspect,
      version: p.version,
      primary,
      followUps: [second, third],
    };
    if (p.description !== undefined) group.description = p.description;
    return [group];
  });
}
