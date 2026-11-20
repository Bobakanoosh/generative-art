import Image from 'next/image';
import Link from 'next/link';
import { galleryItems } from '@/lib/piece/thumbnails';

export default function Home() {
  const items = galleryItems();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="sr-only">Generative Art</h1>
      <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={`${item.slug}-${item.code}`}>
            <Link
              href={item.href}
              className="group relative block overflow-hidden rounded-sm bg-neutral-900 outline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
              style={{ aspectRatio: item.aspect }}
            >
              <Image
                src={item.thumb}
                alt=""
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <span className="sr-only">{item.title}</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {item.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
