import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineSchema, type Params, type ParamSchema, type ParamsOf, type PieceDefinition } from './types';

const PRESETS = [['#000000', '#ffffff']];

const schema = defineSchema({
  count: { kind: 'integer', default: 10, min: 1, max: 100, label: 'Count' },
  scale: { kind: 'number', default: 1, min: 0, max: 2, step: 0.1, label: 'Scale' },
  outline: { kind: 'boolean', default: true, label: 'Outline' },
  background: { kind: 'color', default: '#000000', label: 'Background' },
  palette: { kind: 'palette', default: ['#000000', '#ffffff'], presets: PRESETS, label: 'Palette' },
  mode: { kind: 'select', default: 'lines', options: ['lines', 'dots'], label: 'Mode' },
  layers: { kind: 'multiselect', default: ['a'], options: ['a', 'b', 'c'], label: 'Layers' },
});

describe('defineSchema', () => {
  it('returns the schema unchanged', () => {
    const s = { n: { kind: 'integer', default: 1, min: 0, max: 2, label: 'N' } } as const satisfies ParamSchema;
    expect(defineSchema(s)).toBe(s);
  });

  it('is still a ParamSchema', () => {
    expectTypeOf(schema).toExtend<ParamSchema>();
  });
});

describe('ParamsOf', () => {
  type P = ParamsOf<typeof schema>;

  it('maps each kind to its value type', () => {
    expectTypeOf<P['count']>().toEqualTypeOf<number>();
    expectTypeOf<P['scale']>().toEqualTypeOf<number>();
    expectTypeOf<P['outline']>().toEqualTypeOf<boolean>();
    expectTypeOf<P['background']>().toEqualTypeOf<string>();
    expectTypeOf<P['palette']>().toEqualTypeOf<string[]>();
  });

  it('narrows select and multiselect to their options', () => {
    expectTypeOf<P['mode']>().toEqualTypeOf<'lines' | 'dots'>();
    expectTypeOf<P['layers']>().toEqualTypeOf<('a' | 'b' | 'c')[]>();
  });

  it('has exactly the schema keys', () => {
    expectTypeOf<keyof P>().toEqualTypeOf<keyof typeof schema>();
  });

  it('is plain Params for the wide ParamSchema', () => {
    expectTypeOf<ParamsOf<ParamSchema>>().toEqualTypeOf<Params>();
  });
});

describe('PieceDefinition', () => {
  it('types setup params from its schema', () => {
    type P = ParamsOf<typeof schema>;
    expectTypeOf<Parameters<PieceDefinition<null, P>['setup']>[0]>().toEqualTypeOf<P>();
    expectTypeOf<Parameters<PieceDefinition['setup']>[0]>().toEqualTypeOf<Params>();
  });

  it('a typed piece is still assignable to the registry type', () => {
    const typed = null! as PieceDefinition<{ n: number }, ParamsOf<typeof schema>>;
    const wide: PieceDefinition = typed;
    expect(wide).toBe(typed);
  });
});
