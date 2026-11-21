'use client';

import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Icon } from './Icon';

export type MenuItem =
  | {
      type: 'radio';
      label: string;
      checked: boolean;
      onSelect(): void;
      /** Stay open after selecting (a setting chosen before an action in the same menu). */
      keepOpen?: boolean;
    }
  | { type: 'action'; label: string; onSelect(): void; disabled?: boolean; title?: string }
  | { type: 'heading'; label: string };

/**
 * A menu button: a compact trigger that opens a small list above it
 * (`role="menu"`, radios and actions). Arrow keys, Home and End move between
 * enabled items, Escape closes and refocuses the trigger, a pointer down
 * outside or Tab closes it.
 */
export function Menu({
  label,
  items,
  children,
  disabled,
  title,
  align = 'end',
  triggerClassName = '',
  onIntent,
  triggerRef: outerTriggerRef,
}: {
  /** Accessible name of the trigger. */
  label: string;
  items: MenuItem[];
  /** Visible trigger content. */
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  align?: 'start' | 'end';
  triggerClassName?: string;
  /** Hover or focus on the trigger (e.g. warm up a probe). */
  onIntent?(): void;
  /** Receives the trigger button (e.g. to return focus to it). */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  // On open: focus the checked item, else the first enabled one. Close on a pointer down outside.
  useEffect(() => {
    if (!open) return;
    const enabled = enabledIn(menuRef.current);
    const checked = enabled.find((el) => el.getAttribute('aria-checked') === 'true');
    (checked ?? enabled[0])?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    const enabled = enabledIn(menuRef.current);
    if (enabled.length === 0) return;
    const at = enabled.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (at + 1) % enabled.length;
    else if (e.key === 'ArrowUp') next = at <= 0 ? enabled.length - 1 : at - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next === null) return;
    e.preventDefault();
    enabled[next].focus();
  };

  const itemClass =
    'flex h-8 w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 text-left text-[13px] text-muted focus-visible:[outline-offset:-1px] ' +
    'transition-colors duration-150 ease-out hover:bg-fg/5 hover:text-fg focus-visible:bg-fg/5 focus-visible:text-fg focus:bg-fg/5 focus:text-fg ' +
    'aria-checked:text-fg aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted';

  const renderItem = (item: Exclude<MenuItem, { type: 'heading' }>, i: number) => {
    if (item.type === 'radio') {
      return (
        <button
          key={i}
          type="button"
          role="menuitemradio"
          aria-checked={item.checked}
          tabIndex={-1}
          className={itemClass}
          onClick={() => {
            item.onSelect();
            if (!item.keepOpen) close(true);
          }}
        >
          <span className="inline-flex w-4 justify-center" aria-hidden="true">
            {item.checked && <Icon name="check" size={14} />}
          </span>
          {item.label}
        </button>
      );
    }
    return (
      <button
        key={i}
        type="button"
        role="menuitem"
        aria-disabled={item.disabled ? 'true' : undefined}
        tabIndex={-1}
        title={item.title}
        className={itemClass}
        onClick={() => {
          if (item.disabled) return;
          close(true);
          item.onSelect();
        }}
      >
        <span className="inline-flex w-4 justify-center" aria-hidden="true" />
        {item.label}
      </button>
    );
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={(el) => {
          triggerRef.current = el;
          if (outerTriggerRef) outerTriggerRef.current = el;
        }}
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={
          'inline-flex h-7 cursor-pointer items-center gap-1 rounded-xs px-2 text-[13px] text-muted ' +
          'transition-colors duration-150 ease-out hover:bg-fg/5 hover:text-fg aria-expanded:bg-fg/5 aria-expanded:text-fg ' +
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ' +
          triggerClassName
        }
      >
        {children}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={
            'absolute bottom-full z-30 mb-1.5 min-w-36 rounded-xs border border-line-strong bg-surface py-1 ' +
            (align === 'end' ? 'right-0' : 'left-0')
          }
        >
          {sectionsOf(items).map((section, si) => {
            const rendered = section.items.map(({ item, i }) => renderItem(item, i));
            if (!section.heading) return <Fragment key={`s${si}`}>{rendered}</Fragment>;
            const headingId = `${menuId}-h${si}`;
            return (
              <div key={`s${si}`} role="group" aria-labelledby={headingId}>
                <div
                  id={headingId}
                  role="presentation"
                  className={`ui-label px-3 pb-1 ${section.first ? 'pt-1.5' : 'mt-1 border-t border-line pt-2.5'}`}
                >
                  {section.heading}
                </div>
                {rendered}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The items of `menu` that can take focus (not aria-disabled), in order. */
function enabledIn(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []).filter(
    (el) => el.getAttribute('aria-disabled') !== 'true',
  );
}

interface MenuSection {
  /** Label of the section's heading item, if it has one (items before the first heading have none). */
  heading: string | null;
  /** The heading is the menu's first item (no divider above it). */
  first: boolean;
  items: { item: Exclude<MenuItem, { type: 'heading' }>; i: number }[];
}

/** Splits items at each heading: a headed section renders as a labelled group. */
function sectionsOf(items: MenuItem[]): MenuSection[] {
  const sections: MenuSection[] = [];
  let current: MenuSection = { heading: null, first: false, items: [] };
  items.forEach((item, i) => {
    if (item.type === 'heading') {
      if (current.heading !== null || current.items.length > 0) sections.push(current);
      current = { heading: item.label, first: i === 0, items: [] };
    } else {
      current.items.push({ item, i });
    }
  });
  if (current.heading !== null || current.items.length > 0) sections.push(current);
  return sections;
}
