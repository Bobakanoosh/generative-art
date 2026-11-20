// Server-side only (node:crypto). Imported by the gallery server component and
// the build-time thumbnail script; never import from a client component.
import { createHash } from 'node:crypto';
import { listPieces } from '@/pieces';

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

/** One tile per featured code of each listed piece. */
export function galleryItems(): GalleryItem[] {
  return listPieces().flatMap((p) =>
    p.featured.map((code) => ({
      slug: p.slug,
      title: p.title,
      code,
      aspect: p.aspect,
      thumb: thumbnailPath(p.slug, p.version, code),
      href: `/art/${p.slug}?g=${code}`,
    })),
  );
}
