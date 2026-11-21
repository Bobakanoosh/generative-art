'use client';

import { descriptionId, Field, type ControlProps } from './Field';

/**
 * A boolean parameter: a `role="switch"` button with a 28×16 track.
 * Space and Enter are handled on keydown (and the native keyboard click
 * suppressed) so a key press flips it exactly once in every browser.
 */
export function Toggle({ id, label, description, value, onChange }: ControlProps<boolean>) {
  const flip = () => onChange(!value, false);
  return (
    <Field
      id={id}
      label={label}
      description={description}
      labelFor={id}
      aside={
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={value}
          aria-describedby={description ? descriptionId(id) : undefined}
          onClick={flip}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              if (!e.repeat) flip();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ') e.preventDefault();
          }}
          className={
            'group relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border ' +
            'transition-colors duration-150 ease-out ' +
            (value ? 'border-fg bg-fg' : 'border-line-strong bg-transparent hover:border-fg/50')
          }
        >
          <span
            aria-hidden="true"
            className={
              'absolute left-0.5 size-2.5 rounded-full transition-transform duration-150 ease-out ' +
              (value ? 'translate-x-3 bg-bg' : 'translate-x-0 bg-muted group-hover:bg-fg')
            }
          />
        </button>
      }
    />
  );
}
