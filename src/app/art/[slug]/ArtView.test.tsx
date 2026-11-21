// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// Canvas and recording internals are out of scope here (jsdom has no 2D canvas).
vi.mock('./ArtCanvas', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="art-canvas">
      <div data-testid="player-bar" />
      {children}
    </div>
  ),
}));
vi.mock('./LiveCanvas', () => ({ default: () => <div data-testid="live-canvas" /> }));
vi.mock('./VideoExport', () => ({ default: () => <button type="button">Record video</button> }));

import { encodeGeneration } from '@/lib/piece/share';
import { defaultsOf } from '@/lib/piece/schema';
import { getPiece } from '@/pieces';
import ArtView from './ArtView';

afterEach(cleanup);

function renderArt(slug: string) {
  window.history.replaceState(null, '', `/art/${slug}`);
  return render(<ArtView slug={slug} initialCode={null} initialSeed="abc123" />);
}

describe('ArtView layout', () => {
  it('puts the stage first and the settings panel after it (mobile order), panel scrolling on its own at lg', () => {
    const { container } = renderArt('flow-ribbons');
    const stage = screen.getByRole('region', { name: 'Artwork' });
    const panel = screen.getByRole('complementary', { name: 'Piece settings' });
    expect(stage.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(stage).getByTestId('art-canvas')).toBeTruthy();
    expect(panel.className).toContain('lg:overflow-y-auto');
    expect(panel.className).toContain('lg:overscroll-contain');
    expect((container.firstElementChild as HTMLElement).className).toContain('lg:grid-cols-[minmax(0,1fr)_360px]');
  });

  it('orders the panel: title, description, meta, primary actions, params, secondary actions', () => {
    renderArt('flow-ribbons');
    const panel = screen.getByRole('complementary', { name: 'Piece settings' });
    const title = within(panel).getByRole('heading', { level: 1, name: 'Flow Ribbons' });
    expect(title.className).toContain('font-serif');
    expect(within(panel).getByText('v1 · seed abc123')).toBeTruthy();
    const regenerate = within(panel).getByRole('button', { name: 'Regenerate' });
    const randomize = within(panel).getByRole('button', { name: 'Randomize' });
    const reset = within(panel).getByRole('button', { name: 'Reset settings to defaults' });
    const firstGroup = within(panel).getAllByRole('group').find((g) => g.hasAttribute('data-param-group'))!;
    const copy = within(panel).getByRole('button', { name: 'Copy link' });
    const order = [title, regenerate, randomize, reset, firstGroup, copy];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(regenerate.className).toContain('bg-fg'); // primary
    expect(within(panel).getByRole('link', { name: 'Download PNG' }).getAttribute('href')).toMatch(/^\/api\/render\?slug=flow-ribbons&g=/);
    expect(within(panel).getByRole('button', { name: 'Record video' })).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Print or save as PDF' }).getAttribute('href')).toMatch(/^\/art\/flow-ribbons\/print\?g=/);
  });

  it('regenerate changes the seed in the meta line', () => {
    renderArt('flow-ribbons');
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(screen.queryByText('v1 · seed abc123')).toBeNull();
  });

  it('a live piece runs live and hides the build-only exports', () => {
    renderArt('murmuration');
    expect(screen.getByTestId('live-canvas')).toBeTruthy();
    const panel = screen.getByRole('complementary', { name: 'Piece settings' });
    expect(within(panel).getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(within(panel).queryByRole('link', { name: 'Download PNG' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Record video' })).toBeNull();
    expect(within(panel).queryByRole('link', { name: 'Print or save as PDF' })).toBeNull();
  });
});

describe('ArtView PNG download width', () => {
  const pngWidth = () => {
    const panel = screen.getByRole('complementary', { name: 'Piece settings' });
    const href = within(panel).getByRole('link', { name: 'Download PNG' }).getAttribute('href')!;
    return new URL(href, 'http://x').searchParams.get('w');
  };
  const murmurationMoment = (n: number) => {
    const piece = getPiece('murmuration', 1)!;
    const code = encodeGeneration({ v: 1, s: 'abc123', p: defaultsOf(piece.schema), n });
    window.history.replaceState(null, '', '/art/murmuration');
    render(<ArtView slug="murmuration" initialCode={code} initialSeed="abc123" />);
  };

  it('downloads a build at 4096', () => {
    renderArt('flow-ribbons');
    expect(pngWidth()).toBe('4096');
  });

  it.each([
    [600, '4096'],
    [20_000, '4096'],
    [30_000, '2400'],
    [50_000, '2400'],
    [90_000, '1200'],
  ])('downloads a live moment at step %i at width %s', (n, width) => {
    murmurationMoment(n);
    expect(pngWidth()).toBe(width);
  });
});

describe('ArtView link issues notice', () => {
  // particles out of range, nine params missing, one unknown: 11 issues.
  const code = 'eyJ2IjoxLCJzIjoieCIsInAiOnsicGFydGljbGVzIjo5OTk5OTksImJvZ3VzIjoxfX0';

  it('shows the first 3 issues and folds the rest behind "Show N more", so a bad link does not eat the art', () => {
    window.history.replaceState(null, '', '/art/flow-ribbons');
    render(<ArtView slug="flow-ribbons" initialCode={code} initialSeed="abc123" />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getAllByRole('listitem')).toHaveLength(3);
    const more = within(alert).getByRole('button', { name: 'Show 8 more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(within(alert).getAllByRole('listitem')).toHaveLength(11);
    expect(within(alert).getByRole('button', { name: 'Show fewer' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows up to 3 issues without a toggle', () => {
    window.history.replaceState(null, '', '/art/murmuration');
    // count out of range + one unknown param: 2 issues.
    render(<ArtView slug="murmuration" initialCode="eyJ2IjoxLCJzIjoiZHVzay1iMiIsInAiOnsiY291bnQiOjk5OTk5LCJzcGVlZCI6MS42LCJub2lzZVNjYWxlIjoxLjgsInRyYWlsIjowLjA2LCJyYWRpdXMiOjE2MCwibW9kZSI6ImF0dHJhY3QiLCJib2d1cyI6MywicGFsZXR0ZSI6WyIjZjRkNmI4IiwiI2U5OTY3YSIsIiNjMDYyN2UiLCIjNmM1YTljIiwiI2Y2ZjFlYSJdLCJiYWNrZ3JvdW5kIjoiIzBiMGIxMCJ9LCJuIjo2MDB9" initialSeed="abc123" />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getAllByRole('listitem')).toHaveLength(2);
    expect(within(alert).queryByRole('button', { name: /more|fewer/ })).toBeNull();
  });
});
