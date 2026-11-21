'use client';

import { useEffect, useRef, useState } from 'react';
import { createSliderCommit } from '@/lib/piece/sliderCommit';
import { descriptionId, Field, type ControlProps } from './Field';
import { NumberInput } from './NumberInput';

/** Thumb diameter in px (matches `.range` in globals.css); the fill ends at the thumb's centre. */
const THUMB = 12;

/**
 * A number/integer parameter: a native range (styled by `.range`: 1 px
 * track, filled to the thumb, 12 px round thumb in a 24 px hit area) with the
 * value as an editable mono number on the label row.
 *
 * Dragging reports live values; the first release after them (pointerup,
 * pointercancel, keyup, blur or the native `change` event, whichever comes
 * first) commits once, so a drag the browser takes over (a touch scroll) or
 * focus leaving mid-change never strands an uncommitted value.
 * React's `onChange` on a range input is the native `input` event.
 */
export function Slider({
  id,
  label,
  description,
  value,
  min,
  max,
  step,
  integer = false,
  onChange,
}: ControlProps<number> & { min: number; max: number; step: number; integer?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [tracker] = useState(createSliderCommit);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /** The last dragged value: what a release commits (the input may have been re-rendered since). */
  const lastRef = useRef(value);
  const release = () => {
    if (tracker.commit()) onChangeRef.current(lastRef.current, false);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeChange = () => {
      if (tracker.commit()) onChangeRef.current(lastRef.current, false);
    };
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  }, [tracker]);

  const span = max - min;
  const frac = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;

  return (
    <Field
      id={id}
      label={label}
      description={description}
      labelFor={id}
      aside={
        <NumberInput
          id={`${id}-value`}
          label={`${label} value`}
          value={value}
          min={min}
          max={max}
          step={step}
          integer={integer}
          onChange={onChange}
          className="-mr-1"
        />
      }
    >
      <div className="relative flex h-6 items-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-px bg-line-strong" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 h-px bg-fg"
          style={{ width: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${frac})` }}
        />
        <input
          ref={ref}
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-describedby={description ? descriptionId(id) : undefined}
          onChange={(e) => {
            const next = Number(e.target.value);
            lastRef.current = next;
            tracker.input();
            onChange(next, true);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyUp={release}
          onBlur={release}
          className="range relative w-full"
        />
      </div>
    </Field>
  );
}
