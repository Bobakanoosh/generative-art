import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/** A centred "Not found": the serif title, one line of explanation, a link home. */
export function NotFound({ message }: { message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-serif text-5xl leading-none text-fg">Not found</h1>
      <p className="text-sm text-muted">{message}</p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-2 text-[13px] text-muted transition-colors duration-150 ease-out hover:text-fg"
      >
        <Icon name="arrow-left" size={16} />
        Back to the gallery
      </Link>
    </main>
  );
}
