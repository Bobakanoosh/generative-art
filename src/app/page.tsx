import { galleryGroups } from '@/lib/piece/thumbnails';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/site';
import { GalleryGroup } from './GalleryGroup';
import { galleryGroupStyle } from './galleryLayout';

export default function Home() {
  const groups = galleryGroups();
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <h1 className="sr-only">{SITE_TITLE}</h1>
      {/* Sized like the first group, so the line starts at its left edge on the centred wall. */}
      <div className="mx-auto w-full lg:max-w-(--group-max)" style={groups[0] ? galleryGroupStyle(groups[0].aspect) : undefined}>
        <p className="max-w-[52ch] text-sm text-muted">{SITE_DESCRIPTION}</p>
      </div>
      <div className="mt-8 divide-y divide-line lg:mt-10">
        {groups.map((group, k) => (
          <div key={group.slug} className={k === 0 ? 'pb-14 lg:pb-24' : 'py-14 lg:py-24'}>
            <GalleryGroup group={group} first={k === 0} />
          </div>
        ))}
      </div>
    </main>
  );
}
