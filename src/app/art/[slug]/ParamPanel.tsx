'use client';

import { useId } from 'react';
import { Chips } from '@/components/controls/Chips';
import { ColorSwatch } from '@/components/controls/ColorSwatch';
import { PaletteEditor } from '@/components/controls/PaletteEditor';
import { Segmented } from '@/components/controls/Segmented';
import { Slider } from '@/components/controls/Slider';
import { Toggle } from '@/components/controls/Toggle';
import type { ParamMeta, ParamSchema, ParamSpec, Params } from '@/lib/piece/types';

type Entry = ParamSpec & ParamMeta;
/**
 * `live` is true only for an in-progress change (a slider drag, a colour
 * being picked), drawn instantly; its release and every other control send
 * `live = false` (replays the build).
 */
type OnChange = (key: string, value: unknown, live: boolean) => void;

const DEFAULT_GROUP = 'General';

interface ParamPanelProps {
  schema: ParamSchema;
  params: Params;
  onChange: OnChange;
}

/** One control per schema entry, grouped by `group` in first-appearance order, each group under a hairline. */
export default function ParamPanel({ schema, params, onChange }: ParamPanelProps) {
  const baseId = useId();
  const groups = new Map<string, [string, Entry][]>();
  for (const [key, spec] of Object.entries(schema)) {
    const name = spec.group ?? DEFAULT_GROUP;
    const list = groups.get(name) ?? [];
    list.push([key, spec]);
    groups.set(name, list);
  }

  return (
    <div className="space-y-7">
      {[...groups].map(([name, entries], gi) => {
        const headingId = `${baseId}g${gi}`;
        return (
          <section key={name} role="group" aria-labelledby={headingId} data-param-group className="border-t border-line pt-4">
            <h2 id={headingId} className="ui-label">
              {name}
            </h2>
            <div className="mt-4 space-y-5">
              {entries.map(([key, spec]) => (
                <Control
                  key={key}
                  id={`${baseId}${key}`}
                  spec={spec}
                  value={params[key]}
                  onChange={(value, live) => onChange(key, value, live ?? false)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Control({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: Entry;
  value: unknown;
  onChange(value: unknown, live?: boolean): void;
}) {
  const common = { id, label: spec.label, description: spec.description };
  switch (spec.kind) {
    case 'number':
    case 'integer': {
      const integer = spec.kind === 'integer';
      const step = integer ? 1 : (spec.step ?? (spec.max - spec.min) / 100);
      return (
        <Slider {...common} value={Number(value)} min={spec.min} max={spec.max} step={step} integer={integer} onChange={onChange} />
      );
    }
    case 'boolean':
      return <Toggle {...common} value={Boolean(value)} onChange={onChange} />;
    case 'color':
      return <ColorSwatch {...common} value={String(value)} onChange={onChange} />;
    case 'palette':
      return (
        <PaletteEditor
          {...common}
          value={value as string[]}
          presets={spec.presets}
          minColors={spec.minColors}
          maxColors={spec.maxColors}
          onChange={onChange}
        />
      );
    case 'select':
      return <Segmented {...common} value={String(value)} options={spec.options} onChange={onChange} />;
    case 'multiselect':
      return (
        <Chips {...common} value={value as string[]} options={spec.options} minSelected={spec.minSelected} onChange={onChange} />
      );
  }
}
