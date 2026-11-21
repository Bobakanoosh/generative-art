'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import type { CaptureResult } from '@/lib/capture/client';

const COPIED_MS = 1500;

/**
 * Modal shown after Capture: "Saving…" while a stored capture uploads, then
 * the moment's link (Copy, Open) or the error. Resume unpauses the live
 * piece; closing (Escape, the close button, the backdrop) leaves it paused.
 * Focus returns to whatever opened it (the Capture button).
 */
export default function CaptureDialog({
  result,
  onResume,
  onClose,
}: {
  /** null while saving. */
  result: CaptureResult | null;
  onResume(): void;
  onClose(): void;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Resume takes focus once the dialog is shown (Dialog, a child, opens it in its own earlier effect and
  // remembers the opener first; React's autoFocus would run before that and spoil the focus return).
  useEffect(() => {
    actionsRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  const url = result && result.kind !== 'error' ? new URL(result.url, window.location.origin).href : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <Dialog
      open
      title={result === null ? 'Saving moment…' : result.kind === 'error' ? 'Capture not saved' : 'Moment captured'}
      onClose={onClose}
    >
      <div className="space-y-3 text-sm" aria-live="polite">
        {result === null && <p className="text-muted">Saving…</p>}
        {result?.kind === 'error' && (
          <p role="alert" className="border border-line-strong bg-bg px-3 py-2 text-[13px] text-fg">
            {result.message}
          </p>
        )}
        {url && (
          <>
            <p className="text-[13px] leading-relaxed text-muted">
              {result?.kind === 'stored'
                ? 'Saved with your input. Anyone with this link sees exactly this moment.'
                : 'Anyone with this link sees exactly this moment.'}
            </p>
            <input
              readOnly
              value={url}
              aria-label="Capture link"
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 w-full rounded-xs border border-line-strong bg-bg px-2.5 font-mono text-xs text-fg tabular-nums"
            />
          </>
        )}
      </div>
      <div ref={actionsRef} className="flex flex-wrap items-center gap-2 pt-1">
        {url && (
          <>
            <Button variant="quiet" onClick={copy} aria-live="polite">
              <Icon name={copied ? 'check' : 'link'} size={16} />
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" href={url} target="_blank" rel="noopener">
              Open
            </Button>
          </>
        )}
        <span className="flex-1" />
        <Button variant="primary" onClick={onResume} data-autofocus="">
          <Icon name="play" size={16} />
          Resume
        </Button>
      </div>
    </Dialog>
  );
}
