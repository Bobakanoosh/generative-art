import Link from 'next/link';
import { SITE_TITLE } from '@/lib/site';

/** The site bar: the wordmark, home link, nothing else. Height is `--header-h`. */
export function SiteHeader() {
  return (
    <header className="flex h-(--header-h) shrink-0 items-center border-b border-line bg-bg px-4 sm:px-6 print:hidden">
      <Link
        href="/"
        className="font-serif text-[22px] leading-none tracking-[0.005em] text-fg transition-opacity duration-150 ease-out hover:opacity-75"
      >
        {SITE_TITLE}
      </Link>
    </header>
  );
}
