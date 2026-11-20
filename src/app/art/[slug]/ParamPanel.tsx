'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createSliderCommit } from '@/lib/piece/sliderCommit';
import type { ParamMeta, ParamSchema, ParamSpec, Params } from '@/lib/piece/types';

type Entry = ParamSpec & ParamMeta;
/**
 * `live` is true only while a range slider is being dragged (drawn instantly);
 * its release and every other control send `live = false` (replays the build).
 */
type OnChange = (key: string, value: unknown, live: boolean) => void;

const DEFAULT_GROUP = 'General';

interface ParamPanelProps {
  schema: ParamSchema;
  params: Params;
  onChange: OnChange;
}

/** One control per schema entry, grouped by `group` in first-appearance order. */
export default function ParamPanel({ schema, params, onChange }: ParamPanelProps) {
  const groups = new Map<string, [string, Entry][]>();
  for (const [key, spec] of Object.entries(schema)) {
    const name = spec.group ?? DEFAULT_GROUP;
    const list = groups.get(name) ?? [];
    list.push([key, spec]);
    groups.set(name, list);
  }

  return (
    <div className="space-y-5">
      {[...groups].map(([name, entries]) => (
        <fieldset key={name} className="space-y-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">{name}</legend>
          {entries.map(([key, spec]) => (
            <Control key={key} name={key} spec={spec} value={params[key]} onChange={onChange} />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function Control({ name, spec, value, onChange }: { name: string; spec: Entry; value: unknown; onChange: OnChange }) {
  const id = useId();
  const set = (v: unknown, live = false) => onChange(name, v, live);

  let body: React.ReactNode;
  switch (spec.kind) {
    case 'number':
    case 'integer': {
      const step = spec.kind === 'integer' ? 1 : (spec.step ?? (spec.max - spec.min) / 100);
      body = (
        <div className="flex items-center gap-2">
          <RangeSlider id={id} min={spec.min} max={spec.max} step={step} value={Number(value)} onChange={set} />
          <NumberField value={Number(value)} min={spec.min} max={spec.max} step={step} label={spec.label} onCommit={set} />
        </div>
      );
      break;
    }
    case 'boolean':
      body = (
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={Boolean(value)}
          onChange={(e) => set(e.target.checked)}
          className="h-4 w-4"
        />
      );
      break;
    case 'color':
      body = (
        <input
          id={id}
          type="color"
          value={String(value)}
          onChange={(e) => set(e.target.value)}
          className="h-8 w-14 cursor-pointer bg-transparent"
        />
      );
      break;
    case 'palette':
      body = <PaletteControl id={id} spec={spec} colors={value as string[]} onChange={set} />;
      break;
    case 'select':
      body = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1">
          {spec.options.map((opt) => {
            const active = value === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set(opt)}
                className={`rounded border px-2 py-1 text-sm ${
                  active ? 'border-foreground bg-foreground text-background' : 'border-foreground/20 hover:bg-foreground/10'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
      break;
    case 'multiselect': {
      const selected = value as string[];
      const min = spec.minSelected ?? 0;
      body = (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {spec.options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={checked && selected.length <= min}
                  onChange={(e) =>
                    // Keep schema option order so the share code is stable.
                    set(spec.options.filter((o) => (o === opt ? e.target.checked : selected.includes(o))))
                  }
                />
                {opt}
              </label>
            );
          })}
        </div>
      );
      break;
    }
  }

  // Grouped controls (radios, checkboxes, palette) label themselves; the rest get a <label for>.
  const labelFor = spec.kind === 'select' || spec.kind === 'multiselect' || spec.kind === 'palette' ? undefined : id;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        {labelFor ? (
          <label htmlFor={labelFor} id={`${id}-label`} className="text-sm">
            {spec.label}
          </label>
        ) : (
          <span id={`${id}-label`} className="text-sm">
            {spec.label}
          </span>
        )}
      </div>
      {body}
      {spec.description && <p className="text-xs opacity-60">{spec.description}</p>}
    </div>
  );
}

/**
 * Range input that reports drags as live changes and commits once on release
 * (pointerup, keyup or the native `change` event, whichever comes first).
 * React's `onChange` on a range input is the native `input` event.
 */
function RangeSlider(props: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange(value: number, live: boolean): void;
}) {
  const { onChange } = props;
  const ref = useRef<HTMLInputElement>(null);
  const [tracker] = useState(createSliderCommit);
  const release = (value: number) => {
    if (tracker.commit()) onChange(value, false);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeChange = () => {
      if (tracker.commit()) onChange(Number(el.value), false);
    };
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  }, [tracker, onChange]);

  return (
    <input
      ref={ref}
      id={props.id}
      type="range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      onChange={(e) => {
        tracker.input();
        onChange(Number(e.target.value), true);
      }}
      onPointerUp={(e) => release(Number(e.currentTarget.value))}
      onKeyUp={(e) => release(Number(e.currentTarget.value))}
      className="min-w-0 flex-1"
    />
  );
}

/**
 * Free-typing numeric box: commits on blur/Enter (the reducer clamps), so
 * partial input like "1" on a min-200 field isn't clamped mid-keystroke.
 * Re-keyed on value so slider moves and clamping show up.
 */
function NumberField(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onCommit(v: number): void;
}) {
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n) && n !== props.value) props.onCommit(n);
  };
  return (
    <input
      key={props.value}
      type="number"
      aria-label={`${props.label} value`}
      defaultValue={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
      }}
      className="w-20 rounded border border-foreground/20 bg-transparent px-1.5 py-0.5 text-right font-mono text-sm"
    />
  );
}

function PaletteControl({
  id,
  spec,
  colors,
  onChange,
}: {
  id: string;
  spec: Extract<Entry, { kind: 'palette' }>;
  colors: string[];
  onChange(colors: string[]): void;
}) {
  const min = spec.minColors ?? 1;
  const max = spec.maxColors ?? Infinity;
  const replaceAt = (i: number, c: string) => onChange(colors.map((x, j) => (j === i ? c : x)));
  const removeAt = (i: number) => onChange(colors.filter((_, j) => j !== i));
  const add = () => onChange([...colors, colors[colors.length - 1] ?? '#ffffff']);
  const same = (a: string[]) => a.length === colors.length && a.every((c, i) => c.toLowerCase() === colors[i]);

  return (
    <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {colors.map((c, i) => (
          <div key={i} className="flex flex-col items-center">
            <input
              type="color"
              value={c}
              aria-label={`Color ${i + 1}`}
              onChange={(e) => replaceAt(i, e.target.value)}
              className="h-8 w-8 cursor-pointer bg-transparent"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={colors.length <= min}
              aria-label={`Remove color ${i + 1}`}
              className="text-xs leading-none opacity-60 hover:opacity-100 disabled:opacity-20"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          disabled={colors.length >= max}
          aria-label="Add color"
          className="h-8 w-8 self-start rounded border border-dashed border-foreground/30 text-lg leading-none hover:bg-foreground/10 disabled:opacity-30"
        >
          +
        </button>
      </div>
      {spec.presets && spec.presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {spec.presets.map((preset, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange([...preset])}
              aria-label={`Preset ${i + 1}`}
              aria-pressed={same(preset)}
              className={`flex overflow-hidden rounded border ${
                same(preset) ? 'border-foreground' : 'border-foreground/20 hover:border-foreground/60'
              }`}
            >
              {preset.map((c, j) => (
                <span key={j} className="block h-4 w-3" style={{ background: c }} />
              ))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
