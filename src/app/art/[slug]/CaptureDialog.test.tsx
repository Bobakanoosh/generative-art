// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { CaptureResult } from '@/lib/capture/client';
import CaptureDialog from './CaptureDialog';

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The live bar's Capture button opens the dialog; closing unmounts it (as LiveCanvas does). */
function Harness({ result, onResume = () => {} }: { result: CaptureResult | null; onResume?(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Capture
      </button>
      {open && <CaptureDialog result={result} onResume={onResume} onClose={() => setOpen(false)} />}
    </>
  );
}

function openWith(result: CaptureResult | null, onResume?: () => void) {
  render(<Harness result={result} onResume={onResume} />);
  const opener = screen.getByRole('button', { name: 'Capture' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('CaptureDialog', () => {
  it('is titled "Moment captured" and shows the link in a read-only field', () => {
    openWith({ kind: 'stored', url: '/c/abc123def456' });
    const dialog = screen.getByRole('dialog', { name: 'Moment captured' });
    const field = screen.getByRole('textbox', { name: 'Capture link' }) as HTMLInputElement;
    expect(dialog.contains(field)).toBe(true);
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(`${window.location.origin}/c/abc123def456`);
    expect(field.className).toContain('font-mono');
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(`${window.location.origin}/c/abc123def456`);
  });

  it('Copy writes the link, shows "Copied" with a check icon for 1.5 s, then reverts', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    openWith({ kind: 'link', url: '/art/murmuration?g=abc' });
    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy.querySelector('[data-icon="link"]')).toBeTruthy();
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/art/murmuration?g=abc`);
    const copied = screen.getByRole('button', { name: 'Copied' });
    expect(copied.querySelector('[data-icon="check"]')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('closing (the close button or Escape) returns focus to the Capture button', () => {
    const opener = openWith({ kind: 'link', url: '/art/murmuration?g=abc' });
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Resume calls onResume and has focus first', () => {
    const onResume = vi.fn();
    openWith({ kind: 'link', url: '/x' }, onResume);
    const resume = screen.getByRole('button', { name: 'Resume' });
    expect(document.activeElement).toBe(resume);
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('shows "Saving…" while saving and the error message on failure, without a link', () => {
    const { rerender } = render(<CaptureDialog result={null} onResume={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Saving moment…' })).toBeTruthy();
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    rerender(<CaptureDialog result={{ kind: 'error', message: 'Too many captures' }} onResume={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Capture not saved' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Too many captures');
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });
});
