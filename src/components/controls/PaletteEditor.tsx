'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ColorSwatch } from './ColorSwatch';
import { descriptionId, Field, labelId, rovingIndex, type ControlProps } from './Field';

const sameColors = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i]?.toLowerCase());

const stepButton =
  'inline-flex size-6 cursor-pointer items-center justify-center rounded-xs border border-line font-mono text-sm leading-none text-muted ' +
  'transition-colors duration-150 ease-out hover:border-line-strong hover:text-fg ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted';

/** A swatch's remove control: a small corner badge, shown on hover or focus (always on touch screens). */
const removeBadge =
  'absolute -right-1.5 -top-1.5 z-10 inline-flex size-4 cursor-pointer items-center justify-center rounded-xs border border-line-strong bg-surface text-muted ' +
  'opacity-0 transition-[opacity,color] duration-150 ease-out hover:text-fg focus-visible:opacity-100 ' +
  'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

/**
 * A palette parameter: one swatch per colour (each a `ColorSwatch`, with its
 * own remove control while above minColors), add up to maxColors (both hidden
 * when the size is fixed), and presets as thin strips in a radio group (arrow
 * keys move and apply).
 */
export function PaletteEditor({
  id,
  label,
  description,
  value,
  presets = [],
  minColors = 1,
  maxColors = Infinity,
  onChange,
}: ControlProps<string[]> & { presets?: readonly string[][]; minColors?: number; maxColors?: number }) {
  const presetsRef = useRef<HTMLDivElement>(null);
  const swatchesRef = useRef<HTMLDivElement>(null);
  /** After a removal, the index whose remove control (else swatch) takes focus, so it isn't lost. */
  const focusAfterRemove = useRef<number | null>(null);
  useEffect(() => {
    const at = focusAfterRemove.current;
    if (at === null) return;
    focusAfterRemove.current = null;
    const root = swatchesRef.current;
    const target =
      root?.querySelector<HTMLElement>(`[data-remove-index="${at}"]`) ??
      root?.querySelector<HTMLElement>(`[data-remove-index="${at - 1}"]`) ??
      root?.querySelectorAll<HTMLElement>('input[type="color"]')[Math.min(at, value.length - 1)];
    target?.focus();
  }, [value]);
  const replaceAt = (i: number, c: string, live?: boolean) => onChange(value.map((x, j) => (j === i ? c : x)), live);
  const canAdd = value.length < maxColors;
  const canRemove = value.length > minColors;
  const fixedSize = minColors >= maxColors;
  const checkedIndex = presets.findIndex((p) => sameColors(p, value));

  const removeAt = (i: number) => {
    if (!canRemove) return;
    focusAfterRemove.current = i;
    onChange(value.filter((_, j) => j !== i), false);
  };

  const applyPreset = (i: number) => {
    if (i !== checkedIndex) onChange([...presets[i]], false);
    presetsRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();
  };

  return (
    <Field id={id} label={label} description={description}>
      <div role="group" aria-labelledby={labelId(id)} aria-describedby={description ? descriptionId(id) : undefined}>
        <div className="flex items-center gap-1.5">
          <div ref={swatchesRef} className="flex flex-wrap items-center gap-2 pt-1.5">
            {value.map((c, i) => (
              <span key={i} className="group relative inline-flex">
                <ColorSwatch
                  id={`${id}-c${i}`}
                  label={`Color ${i + 1}`}
                  value={c}
                  bare
                  hideHex
                  onChange={(next, live) => replaceAt(i, next, live)}
                />
                {!fixedSize && canRemove && (
                  <button
                    type="button"
                    aria-label={`Remove color ${i + 1}`}
                    title={`Remove color ${i + 1}`}
                    data-remove-index={i}
                    onClick={() => removeAt(i)}
                    className={removeBadge}
                  >
                    <Icon name="close" size={10} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!fixedSize && (
            <div className="ml-auto flex shrink-0 gap-1.5 pl-2">
              <button
                type="button"
                aria-label="Add color"
                title="Add color"
                disabled={!canAdd}
                onClick={() => canAdd && onChange([...value, value[value.length - 1] ?? '#ffffff'], false)}
                className={stepButton}
              >
                +
              </button>
            </div>
          )}
        </div>

        {presets.length > 0 && (
          <div
            ref={presetsRef}
            role="radiogroup"
            aria-label={`${label} presets`}
            className="mt-3 grid grid-cols-3 gap-x-3"
          >
            {presets.map((preset, i) => {
              const checked = i === checkedIndex;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={`Preset ${i + 1}`}
                  title={`Preset ${i + 1}`}
                  tabIndex={checked || (checkedIndex === -1 && i === 0) ? 0 : -1}
                  onClick={() => applyPreset(i)}
                  onKeyDown={(e) => {
                    const next = rovingIndex(e.key, i, presets.length);
                    if (next === null) return;
                    e.preventDefault();
                    applyPreset(next);
                  }}
                  className="group relative flex h-6 cursor-pointer flex-col justify-center"
                >
                  <span aria-hidden="true" className="flex h-1.5 w-full overflow-hidden">
                    {preset.map((c, j) => (
                      <span key={j} className="h-full flex-1" style={{ background: c }} />
                    ))}
                  </span>
                  <span
                    aria-hidden="true"
                    className={
                      'absolute inset-x-0 bottom-0.5 h-px transition-colors duration-150 ease-out ' +
                      (checked ? 'bg-fg' : 'bg-transparent group-hover:bg-line-strong')
                    }
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Field>
  );
}
