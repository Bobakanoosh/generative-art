'use client';

import { useState } from 'react';

/** Decimal places implied by a step (0.05 → 2), capped at 4. */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step >= 1) return 0;
  const s = String(step);
  const exp = s.match(/e-(\d+)$/);
  if (exp) return Math.min(4, Number(exp[1]));
  return Math.min(4, s.split('.')[1]?.length ?? 0);
}

export function formatNumber(value: number, step: number, integer = false): string {
  return integer ? String(Math.round(value)) : value.toFixed(stepDecimals(step));
}

/**
 * A free-typing numeric box in Geist Mono (a text input, so no spinner
 * arrows). Typing keeps a draft; Enter or blur commits it clamped to
 * [min, max] (rounded for integers), Escape reverts. Nothing is sent while
 * typing, so "1" on its way to "120" is never clamped mid-keystroke.
 */
export function NumberInput({
  id,
  label,
  value,
  min,
  max,
  step,
  integer = false,
  onChange,
  className = '',
}: {
  id: string;
  /** Accessible name (the box has no visible label of its own). */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  onChange(value: number, live?: boolean): void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = formatNumber(value, step, integer);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) return;
    const clamped = Math.min(max, Math.max(min, integer ? Math.round(n) : n));
    if (clamped !== value) onChange(clamped, false);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      value={draft ?? shown}
      size={Math.max(4, formatNumber(max, step, integer).length)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(null);
        }
      }}
      className={
        'h-6 rounded-xs border border-transparent bg-transparent px-1 text-right font-mono text-xs tabular-nums text-muted ' +
        'transition-colors duration-150 ease-out hover:border-line focus:border-line-strong focus:text-fg ' +
        className
      }
    />
  );
}
