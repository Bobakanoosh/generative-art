import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { defaultsOf, randomizeParams, validateParams } from './schema';
import type { ParamSchema } from './types';

const schema: ParamSchema = {
  num: { kind: 'number', default: 5, min: 0, max: 10, step: 0.5, label: 'Num' },
  int: { kind: 'integer', default: 3, min: 1, max: 9, label: 'Int' },
  flag: { kind: 'boolean', default: true, label: 'Flag' },
  col: { kind: 'color', default: '#112233', label: 'Col' },
  pal: { kind: 'palette', default: ['#000000', '#ffffff'], minColors: 2, maxColors: 5, label: 'Pal' },
  sel: { kind: 'select', default: 'a', options: ['a', 'b', 'c'], label: 'Sel' },
  multi: { kind: 'multiselect', default: ['a'], options: ['a', 'b', 'c'], minSelected: 1, label: 'Multi' },
  fixed: { kind: 'integer', default: 4, min: 0, max: 10, label: 'Fixed', randomize: false },
};

describe('defaultsOf', () => {
  it('returns each default', () => {
    expect(defaultsOf(schema)).toEqual({
      num: 5, int: 3, flag: true, col: '#112233', pal: ['#000000', '#ffffff'],
      sel: 'a', multi: ['a'], fixed: 4,
    });
  });
});

describe('validateParams', () => {
  it('accepts valid input unchanged', () => {
    const raw = { ...defaultsOf(schema), num: 7.5, sel: 'b', multi: ['b', 'c'] };
    const r = validateParams(schema, raw);
    expect(r.params).toEqual(raw);
    expect(r.issues).toEqual([]);
  });
  it('clamps number above max', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), num: 99 });
    expect(r.params.num).toBe(10);
    expect(r.issues).toHaveLength(1);
  });
  it('rounds integers', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), int: 3.7 });
    expect(r.params.int).toBe(4);
    expect(r.issues).toHaveLength(1);
  });
  it('wrong type falls back to default', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), num: 'abc' });
    expect(r.params.num).toBe(5);
    expect(r.issues).toHaveLength(1);
  });
  it('missing key falls back to default', () => {
    const raw: Record<string, unknown> = { ...defaultsOf(schema) };
    delete raw.flag;
    const r = validateParams(schema, raw);
    expect(r.params.flag).toBe(true);
    expect(r.issues).toHaveLength(1);
  });
  it('drops unknown keys', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), extra: 1 });
    expect('extra' in r.params).toBe(false);
    expect(r.issues).toHaveLength(1);
  });
  it('select not in options -> default', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), sel: 'zzz' });
    expect(r.params.sel).toBe('a');
    expect(r.issues).toHaveLength(1);
  });
  it('multiselect filters unknown, defaults below minSelected', () => {
    let r = validateParams(schema, { ...defaultsOf(schema), multi: ['b', 'zzz'] });
    expect(r.params.multi).toEqual(['b']);
    expect(r.issues).toHaveLength(1);
    r = validateParams(schema, { ...defaultsOf(schema), multi: ['zzz'] });
    expect(r.params.multi).toEqual(['a']);
    expect(r.issues.length).toBeGreaterThanOrEqual(1);
  });
  it('multiselect dedupes with an issue, preserving first-occurrence order', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), multi: ['b', 'a', 'b'] });
    expect(r.params.multi).toEqual(['b', 'a']);
    expect(r.issues).toHaveLength(1);
  });
  it('multiselect duplicates do not count toward minSelected', () => {
    const s: ParamSchema = {
      m: { kind: 'multiselect', default: ['a', 'b'], options: ['a', 'b'], minSelected: 2, label: 'M' },
    };
    const r = validateParams(s, { m: ['a', 'a'] });
    expect(r.params.m).toEqual(['a', 'b']);
    expect(r.issues.length).toBeGreaterThanOrEqual(1);
  });
  it('invalid color / palette hex -> default', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), col: 'red', pal: ['#000000', 'nope'] });
    expect(r.params.col).toBe('#112233');
    expect(r.params.pal).toEqual(['#000000', '#ffffff']);
    expect(r.issues).toHaveLength(2);
  });
  it('normalizes hex to lowercase #rrggbb', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), col: '#ABC', pal: ['#FF0000', '#00ff00'] });
    expect(r.params.col).toBe('#aabbcc');
    expect(r.params.pal).toEqual(['#ff0000', '#00ff00']);
    expect(r.issues).toEqual([]);
  });
  it('palette outside size bounds -> default', () => {
    const r = validateParams(schema, { ...defaultsOf(schema), pal: ['#000000'] });
    expect(r.params.pal).toEqual(['#000000', '#ffffff']);
    expect(r.issues).toHaveLength(1);
  });
  it('non-object raw -> all defaults, one issue', () => {
    for (const raw of [null, 5, 'x', [1]]) {
      const r = validateParams(schema, raw);
      expect(r.params).toEqual(defaultsOf(schema));
      expect(r.issues).toHaveLength(1);
    }
  });
});

describe('randomizeParams', () => {
  const current = { ...defaultsOf(schema), fixed: 7 };
  it('is deterministic', () => {
    expect(randomizeParams(schema, createRng('x'), current)).toEqual(
      randomizeParams(schema, createRng('x'), current),
    );
  });
  it('stays valid and keeps randomize:false params', () => {
    for (let i = 0; i < 50; i++) {
      const p = randomizeParams(schema, createRng('seed' + i), current);
      expect(p.fixed).toBe(7);
      const v = validateParams(schema, p);
      expect(v.issues).toEqual([]);
      expect(v.params).toEqual(p);
    }
  });
});
