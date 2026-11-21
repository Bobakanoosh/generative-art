import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import flowRibbonsV1 from '@/pieces/flow-ribbons/v1';
import murmurationV1 from '@/pieces/murmuration/v1';
import { defaultsOf } from './schema';
import { decodeGeneration, encodeGeneration } from './share';
import type { ParamSchema, PieceDefinition } from './types';
import {
  INVALID_LINK_ISSUE,
  generationReducer,
  initialGeneration,
  isPiecePath,
  resolvePiece,
  type GenerationState,
} from './generationState';

const schema: ParamSchema = {
  num: { kind: 'number', default: 5, min: 0, max: 10, step: 0.5, label: 'Num' },
  int: { kind: 'integer', default: 3, min: 1, max: 9, label: 'Int' },
  col: { kind: 'color', default: '#112233', label: 'Col' },
  pal: { kind: 'palette', default: ['#000000', '#ffffff'], minColors: 2, maxColors: 5, label: 'Pal' },
  sel: { kind: 'select', default: 'a', options: ['a', 'b', 'c'], label: 'Sel' },
  fixed: { kind: 'integer', default: 4, min: 0, max: 10, label: 'Fixed', randomize: false },
  fixedCol: { kind: 'color', default: '#abcdef', label: 'Fixed col', randomize: false },
};

function fakePiece(version: number, s: ParamSchema = schema): PieceDefinition {
  return {
    slug: 'fake',
    version,
    title: 'Fake',
    aspect: 1,
    schema: s,
    featured: [],
    setup: () => null,
    step: () => {},
    steps: () => 0,
  };
}

const piece = fakePiece(1);

function stateWith(p: Record<string, unknown>, s = 'seed0', issues: string[] = []): GenerationState {
  return { gen: { v: 1, s, p: { ...defaultsOf(schema), ...p } }, issues, motion: 'play' };
}

describe('generationReducer', () => {
  it('regenerate changes only the seed', () => {
    const before = stateWith({ num: 7.5, sel: 'c' });
    const after = generationReducer(before, { type: 'regenerate', seed: 'newseed' });
    expect(after.gen).toEqual({ ...before.gen, s: 'newseed' });
  });

  it('randomize changes the seed and only randomizable params', () => {
    const before = stateWith({ fixed: 9, fixedCol: '#010203' });
    let changedSomething = false;
    for (let i = 0; i < 10; i++) {
      const after = generationReducer(before, {
        type: 'randomize',
        schema,
        seed: `r${i}`,
        rng: createRng(`r${i}`),
      });
      expect(after.gen.s).toBe(`r${i}`);
      expect(after.gen.v).toBe(1);
      expect(after.gen.p.fixed).toBe(9);
      expect(after.gen.p.fixedCol).toBe('#010203');
      if (after.gen.p.num !== 5 || after.gen.p.col !== '#112233') changedSomething = true;
    }
    expect(changedSomething).toBe(true);
  });

  it('randomize is deterministic for a given rng seed', () => {
    const before = stateWith({});
    const a = generationReducer(before, { type: 'randomize', schema, seed: 'x', rng: createRng('k') });
    const b = generationReducer(before, { type: 'randomize', schema, seed: 'x', rng: createRng('k') });
    expect(a).toEqual(b);
  });

  it('reset restores defaults on the seed it is given (the UI passes the current seed) and clears issues', () => {
    const before = stateWith({ num: 1, fixed: 9, pal: ['#ff0000', '#00ff00', '#0000ff'] }, 's', ['x']);
    const after = generationReducer(before, { type: 'reset', schema, seed: 'fresh' });
    expect(after.gen).toEqual({ v: 1, s: 'fresh', p: defaultsOf(schema) });
    expect(after.issues).toEqual([]);
  });

  it('setParam sets a valid value and keeps the seed', () => {
    const before = stateWith({});
    const after = generationReducer(before, { type: 'setParam', schema, key: 'num', value: 2.5, live: false });
    expect(after.gen.p.num).toBe(2.5);
    expect(after.gen.s).toBe('seed0');
    expect(after.gen.p.int).toBe(3);
  });

  it('setParam clamps out-of-range numbers', () => {
    const before = stateWith({});
    expect(generationReducer(before, { type: 'setParam', schema, key: 'num', value: 99, live: false }).gen.p.num).toBe(10);
    expect(generationReducer(before, { type: 'setParam', schema, key: 'int', value: -4, live: false }).gen.p.int).toBe(1);
  });

  it('setParam rejects invalid values by falling back to the default', () => {
    const before = stateWith({ col: '#445566' });
    const after = generationReducer(before, { type: 'setParam', schema, key: 'col', value: 'nope', live: false });
    expect(after.gen.p.col).toBe('#112233');
  });

  it('setParam ignores unknown keys', () => {
    const before = stateWith({});
    const after = generationReducer(before, { type: 'setParam', schema, key: 'bogus', value: 1, live: false });
    expect(after).toBe(before);
  });

  it('does not mutate the previous state', () => {
    const before = stateWith({});
    const snapshot = JSON.stringify(before);
    generationReducer(before, { type: 'setParam', schema, key: 'pal', value: ['#111111', '#222222'], live: false });
    generationReducer(before, { type: 'randomize', schema, seed: 'q', rng: createRng('q') });
    generationReducer(before, { type: 'reset', schema, seed: 'q' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('load replaces the whole state; dismissIssues clears issues', () => {
    const before = stateWith({}, 's', ['old']);
    const next = stateWith({ num: 1 }, 't', ['new']);
    expect(generationReducer(before, { type: 'load', state: next })).toEqual(next);
    expect(generationReducer(before, { type: 'dismissIssues' }).issues).toEqual([]);
  });
});

describe('initialGeneration', () => {
  it('null code → defaults with the given seed and no issues', () => {
    const r = initialGeneration(piece, null, 'abc');
    expect(r).toEqual({ gen: { v: 1, s: 'abc', p: defaultsOf(schema) }, issues: [], motion: 'play' });
  });

  it('garbage code → defaults plus the invalid-link issue', () => {
    const r = initialGeneration(piece, 'garbage!!', 'abc');
    expect(r.gen).toEqual({ v: 1, s: 'abc', p: defaultsOf(schema) });
    expect(r.issues).toEqual([INVALID_LINK_ISSUE]);
    expect(INVALID_LINK_ISSUE).toBe('Invalid link — showing defaults');
  });

  it('code for a version this piece is not → defaults plus the invalid-link issue', () => {
    const code = encodeGeneration({ v: 7, s: 'zz', p: defaultsOf(schema) });
    const r = initialGeneration(piece, code, 'abc');
    expect(r.gen).toEqual({ v: 1, s: 'abc', p: defaultsOf(schema) });
    expect(r.issues).toEqual([INVALID_LINK_ISSUE]);
  });

  it('a code for an older (existing) version is kept as that version', () => {
    // The page resolves the version from the code; v1 still exists even if v2 is latest.
    const v1 = fakePiece(1);
    const code = encodeGeneration({ v: 1, s: 'old', p: { ...defaultsOf(schema), num: 2 } });
    const r = initialGeneration(v1, code, 'abc');
    expect(r.gen).toEqual({ v: 1, s: 'old', p: { ...defaultsOf(schema), num: 2 } });
    expect(r.issues).toEqual([]);
  });

  it('a valid featured code → exactly that generation', () => {
    for (const code of flowRibbonsV1.featured) {
      const r = initialGeneration(flowRibbonsV1, code, 'unused');
      expect(r.issues).toEqual([]);
      expect(r.gen).toEqual(decodeGeneration(code));
      expect(encodeGeneration(r.gen)).toBe(code);
    }
  });

  it('keeps the stop step n from the code', () => {
    const code = encodeGeneration({ v: 1, s: 'n', p: defaultsOf(schema), n: 12 });
    expect(initialGeneration(piece, code, 'abc').gen.n).toBe(12);
  });

  it('n = 0 on a live piece means no stop step (opens running live), not an empty moment', () => {
    const p = defaultsOf(murmurationV1.schema);
    const zero = encodeGeneration({ v: 1, s: 'z', p, n: 0 });
    const r = initialGeneration(murmurationV1 as PieceDefinition, zero, 'abc');
    expect(r.gen).toEqual({ v: 1, s: 'z', p });
    expect('n' in r.gen).toBe(false);
    // A real moment keeps its n.
    const moment = encodeGeneration({ v: 1, s: 'z', p, n: 5 });
    expect(initialGeneration(murmurationV1 as PieceDefinition, moment, 'abc').gen.n).toBe(5);
  });

  it('n = 0 on a build piece is kept (the start of the build)', () => {
    const code = encodeGeneration({ v: 1, s: 'n', p: defaultsOf(schema), n: 0 });
    expect(initialGeneration(piece, code, 'abc').gen.n).toBe(0);
  });

  it('n = 0 on an endless piece whose setup throws is kept (the build canvas shows the error)', () => {
    const throwing = { ...piece, setup: () => { throw new Error('boom'); } } as PieceDefinition;
    const code = encodeGeneration({ v: 1, s: 'n', p: defaultsOf(schema), n: 0 });
    expect(initialGeneration(throwing, code, 'abc').gen.n).toBe(0);
  });

  it('repairs params from a decodable code and reports what changed', () => {
    const code = encodeGeneration({ v: 1, s: 'p', p: { ...defaultsOf(schema), num: 50 } });
    const r = initialGeneration(piece, code, 'abc');
    expect(r.gen.s).toBe('p');
    expect(r.gen.p.num).toBe(10);
    expect(r.issues.length).toBe(1);
  });
});

describe('stop step', () => {
  // A mid-build link (n set) must not leave every later generation half-drawn.
  const before: GenerationState = { gen: { v: 1, s: 'a', p: defaultsOf(schema), n: 5 }, issues: [], motion: 'play' };

  it('regenerate clears n', () => {
    const after = generationReducer(before, { type: 'regenerate', seed: 'b' });
    expect(after.gen).toEqual({ v: 1, s: 'b', p: before.gen.p });
    expect('n' in after.gen).toBe(false);
  });

  it('randomize clears n', () => {
    const after = generationReducer(before, { type: 'randomize', schema, seed: 'b', rng: createRng('b') });
    expect('n' in after.gen).toBe(false);
  });

  it('setParam clears n', () => {
    const after = generationReducer(before, { type: 'setParam', schema, key: 'num', value: 2, live: false });
    expect(after.gen.p.num).toBe(2);
    expect(after.gen.s).toBe('a');
    expect('n' in after.gen).toBe(false);
  });

  it('reset clears n', () => {
    expect('n' in generationReducer(before, { type: 'reset', schema, seed: 'b' }).gen).toBe(false);
  });
});

describe('motion', () => {
  // A live (dragging) change draws instantly; every committed change replays the build.
  const instant: GenerationState = { gen: { v: 1, s: 'a', p: defaultsOf(schema) }, issues: [], motion: 'instant' };

  it('regenerate, randomize and reset play', () => {
    expect(generationReducer(instant, { type: 'regenerate', seed: 'b' }).motion).toBe('play');
    expect(generationReducer(instant, { type: 'randomize', schema, seed: 'b', rng: createRng('b') }).motion).toBe('play');
    expect(generationReducer(instant, { type: 'reset', schema, seed: 'b' }).motion).toBe('play');
  });

  it('load plays, whatever motion the loaded state carries', () => {
    const loaded: GenerationState = { ...instant, gen: { ...instant.gen, s: 'z' } };
    const after = generationReducer(instant, { type: 'load', state: loaded });
    expect(after.motion).toBe('play');
    expect(after.gen).toEqual(loaded.gen);
  });

  it('a live setParam is instant; a committed setParam plays', () => {
    const play = stateWith({});
    const live = generationReducer(play, { type: 'setParam', schema, key: 'num', value: 2, live: true });
    expect(live.motion).toBe('instant');
    expect(live.gen.p.num).toBe(2);
    const commit = generationReducer(live, { type: 'setParam', schema, key: 'num', value: 2, live: false });
    expect(commit.motion).toBe('play');
    expect(commit.gen.p.num).toBe(2);
  });

  it('a committed setParam with an unchanged value still yields a new gen (so the build replays)', () => {
    const live = generationReducer(stateWith({}), { type: 'setParam', schema, key: 'num', value: 2, live: true });
    const commit = generationReducer(live, { type: 'setParam', schema, key: 'num', value: 2, live: false });
    expect(commit.gen).not.toBe(live.gen);
    expect(commit.gen).toEqual(live.gen);
  });

  it('dismissIssues keeps the motion', () => {
    const withIssues: GenerationState = { ...instant, issues: ['x'] };
    expect(generationReducer(withIssues, { type: 'dismissIssues' }).motion).toBe('instant');
  });

  it('initialGeneration plays for every kind of code', () => {
    expect(initialGeneration(piece, null, 'abc').motion).toBe('play');
    expect(initialGeneration(piece, 'garbage!!', 'abc').motion).toBe('play');
    expect(initialGeneration(piece, encodeGeneration({ v: 1, s: 'x', p: defaultsOf(schema) }), 'abc').motion).toBe('play');
  });
});

describe('isPiecePath', () => {
  it('matches this piece page, tolerant of encoding and a trailing slash', () => {
    expect(isPiecePath('/art/flow-ribbons', 'flow-ribbons')).toBe(true);
    expect(isPiecePath('/art/flow-ribbons/', 'flow-ribbons')).toBe(true);
    expect(isPiecePath('/art/flow%2Dribbons', 'flow-ribbons')).toBe(true);
    expect(isPiecePath('/art/caf%C3%A9', 'caf\u00e9')).toBe(true);
  });

  it('rejects other pages and malformed paths', () => {
    expect(isPiecePath('/', 'flow-ribbons')).toBe(false);
    expect(isPiecePath('/art/other', 'flow-ribbons')).toBe(false);
    expect(isPiecePath('/art/flow-ribbons/extra', 'flow-ribbons')).toBe(false);
    expect(isPiecePath('/art/flow-ribbons-2', 'flow-ribbons')).toBe(false);
    expect(isPiecePath('/art', 'flow-ribbons')).toBe(false);
    expect(isPiecePath('/art/%E0%A4%A', 'flow-ribbons')).toBe(false);
  });
});

describe('resolvePiece', () => {
  const v1 = fakePiece(1);
  const v2 = fakePiece(2);
  const lookup = (_slug: string, version?: number) =>
    version === undefined || version === 2 ? v2 : version === 1 ? v1 : undefined;

  it('picks the version named by a valid code', () => {
    expect(resolvePiece('fake', encodeGeneration({ v: 1, s: 'a', p: {} }), lookup)).toBe(v1);
  });

  it('falls back to the latest for null, garbage, or a missing version', () => {
    expect(resolvePiece('fake', null, lookup)).toBe(v2);
    expect(resolvePiece('fake', 'garbage!!', lookup)).toBe(v2);
    expect(resolvePiece('fake', encodeGeneration({ v: 9, s: 'a', p: {} }), lookup)).toBe(v2);
  });

  it('uses the real registry by default', () => {
    expect(resolvePiece('flow-ribbons', null)?.slug).toBe('flow-ribbons');
    expect(resolvePiece('nope', null)).toBeUndefined();
  });
});

describe('goLive', () => {
  // A captured-moment link (endless piece with n) → the same generation, live (no n).
  const moment: GenerationState = { gen: { v: 1, s: 'a', p: defaultsOf(schema), n: 2400 }, issues: ['x'], motion: 'instant' };

  it('drops n, keeps v/s/p and issues, and plays', () => {
    const after = generationReducer(moment, { type: 'goLive' });
    expect(after.gen).toEqual({ v: 1, s: 'a', p: moment.gen.p });
    expect('n' in after.gen).toBe(false);
    expect(after.issues).toEqual(['x']);
    expect(after.motion).toBe('play');
    expect(moment.gen.n).toBe(2400); // not mutated
  });

  it('is a no-op without n', () => {
    const live: GenerationState = { gen: { v: 1, s: 'a', p: defaultsOf(schema) }, issues: [], motion: 'play' };
    expect(generationReducer(live, { type: 'goLive' })).toBe(live);
  });
});
