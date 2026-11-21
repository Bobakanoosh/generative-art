'use client';

import { descriptionId, Field, labelId, type ControlProps } from './Field';

/**
 * A multiselect parameter: toggle chips (`aria-pressed`). A selected chip
 * that would take the selection below `minSelected` is marked disabled
 * (still focusable, with a title saying why) and ignores clicks. The value
 * keeps schema option order, so the share code is stable.
 */
export function Chips({
  id,
  label,
  description,
  value,
  options,
  minSelected = 0,
  onChange,
}: ControlProps<string[]> & { options: readonly string[]; minSelected?: number }) {
  const toggle = (opt: string) => {
    const on = value.includes(opt);
    if (on && value.length <= minSelected) return;
    onChange(
      options.filter((o) => (o === opt ? !on : value.includes(o))),
      false,
    );
  };

  return (
    <Field id={id} label={label} description={description}>
      <div
        role="group"
        aria-labelledby={labelId(id)}
        aria-describedby={description ? descriptionId(id) : undefined}
        className="flex flex-wrap gap-1.5"
      >
        {options.map((opt) => {
          const on = value.includes(opt);
          const locked = on && value.length <= minSelected;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={on}
              aria-disabled={locked ? true : undefined}
              title={locked ? `At least ${minSelected} must stay selected` : undefined}
              onClick={() => toggle(opt)}
              className={
                'h-7 rounded-xs border px-2.5 text-[13px] transition-colors duration-150 ease-out ' +
                (on ? 'border-fg/70 text-fg' : 'cursor-pointer border-line text-muted hover:border-line-strong hover:text-fg') +
                (locked ? ' cursor-not-allowed' : on ? ' cursor-pointer hover:border-fg' : '')
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
