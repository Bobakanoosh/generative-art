'use client';

import { useEffect, useRef } from 'react';
import { descriptionId, Field, type ControlProps } from './Field';

/**
 * A colour parameter: a 24 px swatch over an invisible native
 * `<input type=color>` (so a click opens the picker anchored to the swatch),
 * with the hex in mono beside it. Picking draws live; the picker's `change`
 * (on close) commits.
 *
 * `bare` drops the row (label, description) and names the input with
 * `aria-label`, for swatches inside another control (the palette).
 */
export function ColorSwatch({
  id,
  label,
  description,
  value,
  onChange,
  hideHex = false,
  bare = false,
}: ControlProps<string> & { hideHex?: boolean; bare?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /** The last picked colour: what the picker's `change` commits (the input may have been re-rendered since). */
  const lastRef = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = () => {
      onChangeRef.current(lastRef.current ?? el.value, false);
      lastRef.current = null;
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);

  const swatch = (
    <span className="inline-flex items-center gap-2.5">
      {!hideHex && <span className="font-mono text-xs tabular-nums text-muted">{value.toLowerCase()}</span>}
      <span className="relative inline-flex size-6 shrink-0">
        <input
          ref={ref}
          id={id}
          type="color"
          value={value}
          aria-label={bare ? label : undefined}
          aria-describedby={!bare && description ? descriptionId(id) : undefined}
          onChange={(e) => {
            lastRef.current = e.target.value;
            onChange(e.target.value, true);
          }}
          className="peer absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className={
            'pointer-events-none size-full rounded-xs border border-line-strong transition-colors duration-150 ease-out ' +
            'peer-hover:border-fg/60 peer-focus-visible:outline peer-focus-visible:outline-1 ' +
            'peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus'
          }
          style={{ background: value }}
        />
      </span>
    </span>
  );

  if (bare) return swatch;
  return <Field id={id} label={label} description={description} labelFor={id} aside={swatch} />;
}
