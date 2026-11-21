import type { ReactNode } from 'react';

/** Every control reports `(value, live)`: `live` is an in-progress change drawn instantly; omitted/false commits. */
export type ControlProps<T> = {
  id: string;
  label: string;
  description?: string;
  value: T;
  onChange(value: T, live?: boolean): void;
};

export const descriptionId = (id: string) => `${id}-desc`;
export const labelId = (id: string) => `${id}-label`;

/**
 * One parameter row: label (13 px) with an optional inline control on the
 * right (`aside`), the description under it, then an optional block control.
 * `labelFor` makes the label a real `<label for>`; grouped controls
 * (radios, chips, palette) use `labelId(id)` with aria-labelledby instead.
 */
export function Field({
  id,
  label,
  description,
  labelFor,
  aside,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  labelFor?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const labelClass = 'min-w-0 text-[13px] leading-5 text-fg';
  return (
    <div>
      <div className="flex min-h-6 items-center justify-between gap-4">
        {labelFor ? (
          <label htmlFor={labelFor} id={labelId(id)} className={`${labelClass} cursor-pointer`}>
            {label}
          </label>
        ) : (
          <span id={labelId(id)} className={labelClass}>
            {label}
          </span>
        )}
        {aside && <div className="flex shrink-0 items-center">{aside}</div>}
      </div>
      {description && (
        <p id={descriptionId(id)} className="mt-0.5 max-w-[34ch] text-xs leading-[1.45] text-muted">
          {description}
        </p>
      )}
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

/** Next/previous index for arrow keys in a radio group (wrapping), Home/End; null for other keys. */
export function rovingIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
