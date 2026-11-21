// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EMPTY_LOG } from '@/lib/input/log';

// Canvas internals are out of scope (jsdom has no 2D canvas).
vi.mock('@/app/art/[slug]/ArtCanvas', () => ({
  default: () => <div data-testid="art-canvas" />,
}));
vi.mock('@/app/art/[slug]/VideoExport', () => ({ default: () => <button type="button">Record video</button> }));
vi.mock('@/lib/print/renderTile', () => ({ renderPrintTile: () => {} }));

import CaptureView from './c/[id]/CaptureView';
import CaptureNotFound from './c/[id]/not-found';
import PieceNotFound from './art/[slug]/not-found';
import PrintView from './art/[slug]/print/PrintView';
import SiteNotFound from './not-found';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(cleanup);

describe('CaptureView', () => {
  const capture = { slug: 'murmuration', v: 1, s: 'abc123', p: {}, n: 600, i: EMPTY_LOG };

  it('uses the piece page stage/panel layout with a "Captured moment" eyebrow and no params', () => {
    const { container } = render(<CaptureView id="abcdefghijkl" capture={capture} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('lg:grid-cols-[minmax(0,1fr)_360px]');
    const stage = screen.getByRole('region', { name: 'Artwork' });
    expect(within(stage).getByTestId('art-canvas')).toBeTruthy();
    const panel = screen.getByRole('complementary', { name: 'Capture' });
    const eyebrow = within(panel).getByText('Captured moment');
    const title = within(panel).getByRole('heading', { level: 1, name: 'Murmuration' });
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.className).toContain('font-serif');
    expect(within(panel).getByText(/step 600/)).toBeTruthy();
    expect(within(panel).queryAllByRole('group').filter((g) => g.hasAttribute('data-param-group'))).toHaveLength(0);
  });

  it('offers Open this piece live, Copy link, PNG, video and print', () => {
    render(<CaptureView id="abcdefghijkl" capture={capture} />);
    const panel = screen.getByRole('complementary', { name: 'Capture' });
    expect(within(panel).getByRole('link', { name: 'Open this piece live' }).getAttribute('href')).toBe('/art/murmuration');
    expect(within(panel).getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Download PNG' }).getAttribute('href')).toMatch(/^\/api\/render\/c\/abcdefghijkl/);
    expect(within(panel).getByRole('button', { name: 'Record video' })).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Print or save as PDF' }).getAttribute('href')).toBe('/c/abcdefghijkl/print');
  });

  it('keeps the action rows right under "Open this piece live" (not pinned to the panel bottom: no params to fill the gap)', () => {
    render(<CaptureView id="abcdefghijkl" capture={capture} />);
    const panel = screen.getByRole('complementary', { name: 'Capture' });
    const rows = within(panel).getByRole('button', { name: 'Copy link' }).closest('[data-action-rows]') as HTMLElement;
    expect(rows).toBeTruthy();
    expect(rows.className).not.toContain('mt-auto');
  });
});

describe('not-found pages', () => {
  it.each([
    ['piece', PieceNotFound],
    ['capture', CaptureNotFound],
    ['site', SiteNotFound],
  ])('%s: centred serif "Not found", one line, a link home', (_name, Page) => {
    render(<Page />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Not found' });
    expect(heading.className).toContain('font-serif');
    expect(screen.getByRole('link', { name: /gallery/i }).getAttribute('href')).toBe('/');
  });
});

describe('PrintView chrome', () => {
  it('has a back link, a paper chooser, a caption switch and a primary Print button', () => {
    render(<PrintView slug="flow-ribbons" initialCode={null} initialSeed="abc123" />);
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toMatch(/^\/art\/flow-ribbons\?g=/);
    const paper = screen.getByRole('combobox', { name: 'Paper' }) as HTMLSelectElement;
    expect(paper.value).toBe('Letter (8.5 × 11 in)');
    const caption = screen.getByRole('switch', { name: 'Caption' });
    expect(caption.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('print-caption')).toBeTruthy();
    fireEvent.click(caption);
    expect(screen.queryByTestId('print-caption')).toBeNull();
    fireEvent.change(paper, { target: { value: 'A4 (210 × 297 mm)' } });
    expect((screen.getByRole('combobox', { name: 'Paper' }) as HTMLSelectElement).value).toBe('A4 (210 × 297 mm)');
    expect(screen.getByRole('button', { name: 'Print or save as PDF' }).className).toContain('bg-fg');
  });
});
