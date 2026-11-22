import Link from 'next/link';
import { ARTIST_NAME, ARTIST_URL, SITE_TITLE } from '@/lib/site';

/**
 * The site bar: a breadcrumb from the artist's main site to this one
 * ("Jack Englund / Generative Art"), nothing else. Height is `--header-h`.
 */
export function SiteHeader() {
  return (
    <header className="flex h-(--header-h) shrink-0 items-center border-b border-line bg-bg px-4 sm:px-6 print:hidden">
      <nav aria-label="Site" className="flex min-w-0 items-baseline gap-2.5 font-serif text-[22px] leading-none tracking-[0.005em]">
        <a
          href={ARTIST_URL}
          className="shrink-0 text-muted transition-colors duration-150 ease-out hover:text-fg"
        >
          {ARTIST_NAME}
        </a>
        <span aria-hidden="true" className="text-faint">
          /
        </span>
        <Link
          href="/"
          className="truncate text-fg transition-opacity duration-150 ease-out hover:opacity-75"
        >
          {SITE_TITLE}
        </Link>
      </nav>
    </header>
  );
}
