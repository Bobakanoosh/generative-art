import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { GalleryGroup as Group, GalleryItem } from '@/lib/piece/thumbnails';
import { galleryGroupStyle } from './galleryLayout';

/*
 * One piece on the gallery wall: a large primary and two follow-ups, set close
 * together (16 px) so they read as one unit against the wide space between
 * groups.
 *
 * Desktop (lg): the primary in a flexible column, the follow-ups stacked in a
 * narrow one beside it (`galleryLayout.ts`), sized so the stack is exactly as
 * tall as the primary at the piece's own aspect. The group is narrowed so the
 * primary fits the viewport height and hangs centred on the wall.
 *
 * Mobile: primary full width, the two follow-ups as a 2-column row beneath.
 */

const PRIMARY_SIZES = '(min-width: 1024px) min(62vw, 760px), calc(100vw - 48px)';
const FOLLOW_UP_SIZES = '(min-width: 1024px) min(31vw, 380px), calc(50vw - 30px)';

function Frame({
  item,
  label,
  sizes,
  preload,
  className,
  style,
}: {
  item: GalleryItem;
  label: string;
  sizes: string;
  preload?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Link href={item.href} className={`group/frame relative block overflow-hidden bg-surface ${className ?? ''}`} style={style}>
      <Image
        src={item.thumb}
        alt=""
        fill
        sizes={sizes}
        preload={preload}
        className="object-contain transition-[filter] duration-200 ease-out group-hover/frame:brightness-110 group-focus-visible/frame:brightness-110"
      />
      <span className="sr-only">{label}</span>
    </Link>
  );
}

export function GalleryGroup({ group, first = false }: { group: Group; first?: boolean }) {
  const { aspect, title, primary, followUps } = group;
  const headingId = `piece-${group.slug}`;

  return (
    <article aria-labelledby={headingId} className="mx-auto w-full lg:max-w-(--group-max)" style={galleryGroupStyle(aspect)}>
      <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-(--cols) lg:gap-4">
        <Frame
          item={primary}
          label={`${title} — featured`}
          sizes={PRIMARY_SIZES}
          preload={first}
          className="col-span-2 aspect-(--a) lg:col-span-1"
        />
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {followUps.map((item, k) => (
            <Frame
              key={item.code}
              item={item}
              label={`${title} — variation ${k + 2}`}
              sizes={FOLLOW_UP_SIZES}
              className="aspect-(--a)"
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-x-4 gap-y-4 lg:mt-6 lg:grid-cols-(--cols)">
        <div>
          <h2 id={headingId} className="font-serif text-[32px] leading-[1.05] tracking-[-0.005em] text-fg lg:text-[40px]">
            {title}
          </h2>
          {group.description && <p className="mt-2 max-w-[58ch] text-sm text-muted">{group.description}</p>}
        </div>
        <div className="flex items-baseline justify-between gap-4 lg:pt-3">
          <p className="font-mono text-xs tabular-nums text-faint">
            v{group.version} · {1 + followUps.length} variations
          </p>
          <Link
            href={primary.href}
            className="group/open inline-flex items-baseline gap-1.5 text-[13px] text-fg transition-opacity duration-150 ease-out hover:opacity-75"
          >
            Open piece<span className="sr-only">: {title}</span>
            <span aria-hidden="true" className="transition-transform duration-150 ease-out group-hover/open:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}
