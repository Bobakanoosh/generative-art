// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import Home from './page';
import { galleryGroups } from '@/lib/piece/thumbnails';
import { SITE_DESCRIPTION } from '@/lib/site';

afterEach(cleanup);

describe('gallery page', () => {
  it('shows one labelled group per piece, links in tab order primary → follow-ups → open', () => {
    render(<Home />);
    const groups = galleryGroups();
    expect(groups.length).toBeGreaterThan(1);
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(groups.length);

    for (const [k, g] of groups.entries()) {
      const article = articles[k];
      expect(within(article).getByRole('heading', { level: 2 }).textContent).toBe(g.title);
      expect(article.getAttribute('aria-labelledby')).toBe(within(article).getByRole('heading').id);

      const links = within(article).getAllByRole('link');
      expect(links.map((l) => l.textContent)).toEqual([
        `${g.title} — featured`,
        `${g.title} — variation 2`,
        `${g.title} — variation 3`,
        expect.stringMatching(/^Open piece/),
      ]);
      expect(links.map((l) => l.getAttribute('href'))).toEqual([
        g.primary.href, g.followUps[0].href, g.followUps[1].href, g.primary.href,
      ]);
      expect(within(article).getByText(`v${g.version} · 3 variations`)).toBeTruthy();
      if (g.description) expect(within(article).getByText(g.description)).toBeTruthy();

      // Never crop: every image is contained in a box of the piece's aspect.
      for (const img of within(article).getAllByRole('presentation', { hidden: true })) {
        expect(img.className).toContain('object-contain');
        expect(img.className).not.toMatch(/scale|object-cover/);
      }
    }
  });

  it('eagerly loads only the first primary; the rest lazy-load', () => {
    render(<Home />);
    const imgs = [...document.querySelectorAll('img')];
    expect(imgs).toHaveLength(galleryGroups().length * 3);
    expect(imgs[0].getAttribute('loading')).not.toBe('lazy');
    for (const img of imgs.slice(1)) expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('leads with one quiet line, not a hero', () => {
    render(<Home />);
    expect(screen.getByText(SITE_DESCRIPTION)).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
