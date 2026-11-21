'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { IconButton } from './IconButton';

export type DialogProps = {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
};

/**
 * A modal on the native `<dialog>` (`showModal`, so focus is trapped and the
 * page is inert). Escape, the close button and a backdrop click ask the owner
 * to close via `onClose`; the owner flips `open`. Focus returns to whatever
 * had it when the dialog opened.
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  // Escape fires keydown and then the native `cancel` in the same task; ask to
  // close only once per task. The latch clears on the next task, so if the
  // owner declines to close, a later Escape/close/backdrop click asks again.
  const requestedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      requestedRef.current = false;
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus();
    }
  }, [open]);

  // Unmounting while open: still give focus back.
  useEffect(
    () => () => {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    },
    [],
  );

  const requestClose = () => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setTimeout(() => {
      requestedRef.current = false;
    }, 0);
    onClose();
  };

  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault();
    requestClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose();
    }
  };

  // A click whose target is the <dialog> itself landed on the backdrop.
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-xs border border-line-strong bg-surface p-0 text-fg backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-2xl leading-tight">
            {title}
          </h2>
          <div className="-mr-1.5 -mt-1">
            <IconButton icon="close" label="Close" onClick={requestClose} />
          </div>
        </div>
        {children}
      </div>
    </dialog>
  );
}
