'use client';

import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { descriptionId, Field, labelId, rovingIndex, type ControlProps } from './Field';

/** More options than this and a select is shown instead of the segmented text row. */
export const SEGMENTED_MAX = 4;

/**
 * A select parameter. Up to four options: a row of text radios (the selected
 * one in `--fg` and underlined, the rest `--muted`) with roving focus and
 * arrow keys. More: a styled native `<select>`.
 */
export function Segmented({
  id,
  label,
  description,
  value,
  options,
  onChange,
}: ControlProps<string> & { options: readonly string[] }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const describedBy = description ? descriptionId(id) : undefined;

  if (options.length > SEGMENTED_MAX) {
    return (
      <Field
        id={id}
        label={label}
        description={description}
        labelFor={id}
        aside={
          <span className="relative inline-flex items-center">
            <select
              id={id}
              value={value}
              aria-describedby={describedBy}
              onChange={(e) => onChange(e.target.value, false)}
              className={
                'h-7 cursor-pointer appearance-none rounded-xs border border-line-strong bg-bg py-0 pr-7 pl-2.5 text-[13px] text-fg ' +
                'transition-colors duration-150 ease-out hover:border-fg/50'
              }
            >
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="pointer-events-none absolute right-1.5 text-muted">
              <Icon name="chevron-down" size={14} />
            </span>
          </span>
        }
      />
    );
  }

  const selectedIndex = options.indexOf(value);
  const select = (i: number) => {
    const opt = options[i];
    if (opt !== value) onChange(opt, false);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();
  };

  return (
    <Field
      id={id}
      label={label}
      description={description}
      aside={
        <div
          ref={groupRef}
          role="radiogroup"
          aria-labelledby={labelId(id)}
          aria-describedby={describedBy}
          className="-mr-1 flex flex-wrap justify-end"
        >
          {options.map((opt, i) => {
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={active}
                // Roving focus: only the selected option (or the first, if none) is in the tab order.
                tabIndex={active || (selectedIndex === -1 && i === 0) ? 0 : -1}
                onClick={() => select(i)}
                onKeyDown={(e) => {
                  const next = rovingIndex(e.key, i, options.length);
                  if (next === null) return;
                  e.preventDefault();
                  select(next);
                }}
                className={
                  'h-6 cursor-pointer px-1.5 text-[13px] decoration-1 underline-offset-[5px] transition-colors duration-150 ease-out ' +
                  (active ? 'text-fg underline' : 'text-muted hover:text-fg')
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
      }
    />
  );
}
