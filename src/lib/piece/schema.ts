import type { Rng } from '@/lib/art/rng';
import type { ParamSchema, Params } from './types';

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalize `#rgb` / `#rrggbb` (any case) to lowercase `#rrggbb`, or null. */
function normHex(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const m = HEX_RE.exec(x);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return '#' + h;
}

function cloneDefault<T>(v: T): T {
  return Array.isArray(v) ? ([...v] as unknown as T) : v;
}

export function defaultsOf(schema: ParamSchema): Params {
  const out: Params = {};
  for (const [key, spec] of Object.entries(schema)) out[key] = cloneDefault(spec.default);
  return out;
}

/**
 * FROZEN: every share code's params pass through this on the way to a piece,
 * so how it clamps, snaps, and defaults values is part of what existing codes
 * draw. Changing it changes deployed images; add a new function instead.
 */
export function validateParams(
  schema: ParamSchema,
  raw: unknown,
): { params: Params; issues: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { params: defaultsOf(schema), issues: ['Params must be an object; using defaults.'] };
  }
  const input = raw as Record<string, unknown>;
  const params: Params = {};
  const issues: string[] = [];

  for (const [key, spec] of Object.entries(schema)) {
    const fallback = (why: string) => {
      issues.push(`${key}: ${why}; using default.`);
      params[key] = cloneDefault(spec.default);
    };
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      fallback('missing');
      continue;
    }
    const val = input[key];

    switch (spec.kind) {
      case 'number':
      case 'integer': {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          fallback('expected a number');
          break;
        }
        let n = spec.kind === 'integer' ? Math.round(val) : val;
        if (n < spec.min || n > spec.max) {
          n = Math.min(spec.max, Math.max(spec.min, n));
          issues.push(`${key}: out of range ${spec.min}..${spec.max}; clamped to ${n}.`);
        } else if (n !== val) {
          issues.push(`${key}: expected an integer; rounded to ${n}.`);
        }
        params[key] = n;
        break;
      }
      case 'boolean':
        if (typeof val === 'boolean') params[key] = val;
        else fallback('expected a boolean');
        break;
      case 'color': {
        const c = normHex(val);
        if (c) params[key] = c;
        else fallback('expected a hex color like #rrggbb');
        break;
      }
      case 'palette': {
        if (!Array.isArray(val)) {
          fallback('expected an array of hex colors');
          break;
        }
        const colors = val.map(normHex);
        if (colors.some((c) => c === null)) {
          fallback('contains an invalid hex color');
          break;
        }
        const min = spec.minColors ?? 1;
        const max = spec.maxColors ?? Infinity;
        if (colors.length < min || colors.length > max) {
          fallback(`expected ${min}..${max} colors`);
          break;
        }
        params[key] = colors as string[];
        break;
      }
      case 'select':
        if (typeof val === 'string' && spec.options.includes(val)) params[key] = val;
        else fallback(`expected one of ${spec.options.join(', ')}`);
        break;
      case 'multiselect': {
        if (!Array.isArray(val)) {
          fallback('expected an array');
          break;
        }
        const valid = val.filter((o): o is string => typeof o === 'string' && spec.options.includes(o));
        const kept = [...new Set(valid)];
        const min = spec.minSelected ?? 0;
        if (kept.length < min) {
          fallback(`expected at least ${min} distinct valid option(s)`);
          break;
        }
        if (valid.length !== val.length) issues.push(`${key}: unknown options removed.`);
        if (kept.length !== valid.length) issues.push(`${key}: duplicate options removed.`);
        params[key] = kept;
        break;
      }
    }
  }

  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) issues.push(`${key}: unknown param dropped.`);
  }
  return { params, issues };
}

function randomHex(rng: Rng): string {
  let out = '#';
  for (let i = 0; i < 3; i++) out += rng.int(0, 256).toString(16).padStart(2, '0');
  return out;
}

export function randomizeParams(schema: ParamSchema, rng: Rng, current: Params): Params {
  const out: Params = {};
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.randomize === false) {
      out[key] = Object.prototype.hasOwnProperty.call(current, key)
        ? current[key]
        : cloneDefault(spec.default);
      continue;
    }
    switch (spec.kind) {
      case 'number': {
        let n: number;
        if (spec.step && spec.step > 0) {
          const steps = Math.floor((spec.max - spec.min) / spec.step);
          n = spec.min + rng.int(0, steps + 1) * spec.step;
        } else {
          n = rng.range(spec.min, spec.max);
        }
        out[key] = Math.min(spec.max, Math.max(spec.min, n));
        break;
      }
      case 'integer':
        out[key] = rng.int(spec.min, spec.max + 1);
        break;
      case 'boolean':
        out[key] = rng.bool();
        break;
      case 'color':
        out[key] = randomHex(rng);
        break;
      case 'palette': {
        if (spec.presets && spec.presets.length > 0) {
          out[key] = [...rng.pick(spec.presets)];
        } else {
          const min = spec.minColors ?? 1;
          const max = spec.maxColors ?? Math.max(min, spec.default.length);
          const count = rng.int(min, max + 1);
          out[key] = Array.from({ length: count }, () => randomHex(rng));
        }
        break;
      }
      case 'select':
        out[key] = rng.pick(spec.options);
        break;
      case 'multiselect': {
        const min = Math.max(spec.minSelected ?? 0, 0);
        const count = rng.int(min, spec.options.length + 1);
        out[key] = rng.shuffle(spec.options).slice(0, count);
        break;
      }
    }
  }
  return out;
}
