// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Icon, ICON_NAMES } from './Icon';
import { Dialog } from './Dialog';
import { SiteHeader } from './SiteHeader';
import { ARTIST_NAME, ARTIST_URL, SITE_DESCRIPTION, SITE_TITLE } from '@/lib/site';

// jsdom has <dialog> but not showModal/close; give it a minimal shim.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal) {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!proto.close) {
    proto.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

afterEach(cleanup);

describe('site constants', () => {
  it('exports the title and description', () => {
    expect(SITE_TITLE).toBe('Generative Art');
    expect(SITE_DESCRIPTION).toBe('A portfolio of generative art. Every piece is reproducible from a share link.');
  });
});

describe('Button', () => {
  it('renders an <a href> when href is given', () => {
    render(<Button href="/art/x">Open</Button>);
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/art/x');
  });

  it('renders <button type="button"> without href', () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('passes a ref to the <button> (so callers can move focus to it)', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Go</Button>);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Go' }));
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a disabled link that is inert: no href, no onClick, not tabbable', () => {
    const onClick = vi.fn();
    render(
      <Button href="/art/x" onClick={onClick} disabled>
        Open
      </Button>,
    );
    const link = screen.getByText('Open');
    expect(link.tagName).toBe('A');
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled and forwards aria-*', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} aria-describedby="hint" variant="quiet" size="sm">
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.getAttribute('aria-describedby')).toBe('hint');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('IconButton', () => {
  it('uses the label as aria-label and title', () => {
    render(<IconButton icon="play" label="Play" />);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button.getAttribute('aria-label')).toBe('Play');
    expect(button.getAttribute('title')).toBe('Play');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
  });

  it('sets aria-pressed when pressed is given', () => {
    const { rerender } = render(<IconButton icon="shuffle" label="Shuffle" pressed />);
    expect(screen.getByRole('button', { name: 'Shuffle' }).getAttribute('aria-pressed')).toBe('true');
    rerender(<IconButton icon="shuffle" label="Shuffle" pressed={false} />);
    expect(screen.getByRole('button', { name: 'Shuffle' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onClick unless disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<IconButton icon="play" label="Play" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<IconButton icon="play" label="Play" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Icon', () => {
  it('lists every icon name', () => {
    expect([...ICON_NAMES].sort()).toEqual(
      [
        'play', 'pause', 'replay', 'skip', 'restart', 'capture', 'record', 'stop', 'download', 'print',
        'link', 'check', 'close', 'shuffle', 'dice', 'reset', 'chevron-down', 'arrow-left', 'video',
      ].sort(),
    );
  });

  it.each(ICON_NAMES)('renders %s as an aria-hidden 20x20 svg', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 20 20');
    expect(svg!.getAttribute('stroke')).toBe('currentColor');
    expect(svg!.getAttribute('stroke-width')).toBe('1.5');
    expect(svg!.children.length).toBeGreaterThan(0);
  });

  it('honours size', () => {
    const { container } = render(<Icon name="play" size={16} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
  });
});

describe('Dialog', () => {
  it('is labelled by its title and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Save capture" onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Save capture' });
    expect(dialog.hasAttribute('open')).toBe(true);
    // A real browser fires `cancel` on Escape; jsdom doesn't, so test both paths.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on the native cancel event', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="T" onClose={onClose}>
        x
      </Dialog>,
    );
    fireEvent(screen.getByRole('dialog', { name: 'T' }), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has a close button that calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="T" onClose={onClose}>
        x
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('asks again on a later Escape when the owner declined to close', async () => {
    const onClose = vi.fn(); // owner never flips `open`
    render(
      <Dialog open title="T" onClose={onClose}>
        x
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'T' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('asks once when Escape fires keydown then the native cancel in the same task', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="T" onClose={onClose}>
        x
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'T' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('returns focus to the opener when closed', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} title="T" onClose={() => setOpen(false)}>
            <input aria-label="field" />
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'T' });
    expect(dialog.hasAttribute('open')).toBe(true);
    screen.getByRole('textbox', { name: 'field' }).focus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});

describe('SiteHeader', () => {
  it('renders the wordmark linking home inside a banner', () => {
    render(<SiteHeader />);
    const banner = screen.getByRole('banner');
    const link = screen.getByRole('link', { name: SITE_TITLE });
    expect(banner.contains(link)).toBe(true);
    expect(link.getAttribute('href')).toBe('/');
  });

  it("names the artist, linking out to the artist's main site", () => {
    render(<SiteHeader />);
    const banner = screen.getByRole('banner');
    const artist = screen.getByRole('link', { name: ARTIST_NAME });
    expect(banner.contains(artist)).toBe(true);
    expect(artist.getAttribute('href')).toBe('https://jackenglund.com');
    expect(ARTIST_URL).toBe('https://jackenglund.com');
    // The name comes before the site title, read as a breadcrumb.
    const links = Array.from(banner.querySelectorAll('a')).map((a) => a.textContent);
    expect(links).toEqual([ARTIST_NAME, SITE_TITLE]);
  });
});
