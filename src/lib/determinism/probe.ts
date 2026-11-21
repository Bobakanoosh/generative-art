/**
 * Cross-engine determinism probe. Engine-neutral on purpose: no node: imports,
 * no crypto, no Buffer. Bundled by scripts/cross-engine.ts and run in Node,
 * WebKit and Firefox; the hash maps must be identical.
 */
import { allVersions } from '@/pieces';
import { decodeGeneration } from '@/lib/piece/share';
import { replaySource, type InputLog } from '@/lib/input/log';
import { createRunner } from '@/lib/render/runner';
import type { PieceDefinition } from '@/lib/piece/types';

const BASIS_A = 0x811c9dc5;
const BASIS_B = 0x9e3779b9;
const PRIME = 0x01000193;
const PROBE_STEPS = 2000;
const PROBE_WIDTH_PX = 1000;

function hex8(n: number): string {
  let s = (n >>> 0).toString(16);
  while (s.length < 8) s = '0' + s;
  return s;
}

/** Streaming two-lane FNV-1a over UTF-16 code units. */
function createHasher() {
  let a = BASIS_A;
  let b = BASIS_B;
  return {
    update(s: string) {
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        a = Math.imul(a ^ c, PRIME);
        b = Math.imul(b ^ c, PRIME);
      }
    },
    digest: () => hex8(a) + hex8(b),
  };
}

/** Engine-neutral 64-bit hash (two 32-bit FNV-1a lanes using Math.imul), hex. */
export function hashText(s: string): string {
  const h = createHasher();
  h.update(s);
  return h.digest();
}

/** Recording fake 2D context: every method call and property set appended as text (numbers via String(n)). */
export function recordingContext(): { ctx: CanvasRenderingContext2D; hash(): string } {
  const hasher = createHasher();
  let gradients = 0;
  const fmt = (v: unknown): string => {
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (v && typeof v === 'object' && '__id' in v) return `#grad${(v as { __id: number }).__id}`;
    return String(v);
  };
  const values: Record<string, unknown> = {};
  const canvas = { width: 1000, height: 1000 };
  const makeGradient = () => {
    const id = gradients++;
    return {
      __id: id,
      addColorStop(...args: unknown[]) {
        hasher.update(`grad${id}.addColorStop(${args.map(fmt).join(',')})\n`);
      },
    };
  };
  const target = {} as Record<string, unknown>;
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'canvas') return canvas;
      if (prop in values) return values[prop];
      return (...args: unknown[]) => {
        hasher.update(`${prop}(${args.map(fmt).join(',')})\n`);
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return makeGradient();
        return undefined;
      };
    },
    set(_t, prop, value) {
      if (typeof prop !== 'string') return true;
      values[prop] = value;
      hasher.update(`${prop}=${fmt(value)}\n`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, hash: () => hasher.digest() };
}

/** Fixed synthetic input: pointer enters, drags down the canvas, presses Space, lifts and leaves. */
function syntheticLog(aspect: number): InputLog {
  const maxQy = Math.round((1000 / aspect) * 10);
  const p: number[][] = [[10, 5000, 0, 0], [5, 5000, 0, 1]];
  const moves = 40;
  for (let m = 1; m <= moves; m++) {
    p.push([25, 5000 + ((m * 37) % 600) - 300, Math.round((maxQy * m) / moves), 1]);
  }
  p.push([5, 5000, maxQy, 0]);
  p.push([5]);
  return { p, k: [[600, ' ']] };
}

function hashRun(piece: PieceDefinition, code: string, withInput: boolean): string {
  const gen = decodeGeneration(code);
  if (!gen) throw new Error(`${piece.slug}@v${piece.version}: code failed to decode`);
  const run = { ...gen, n: Math.min(gen.n ?? PROBE_STEPS, PROBE_STEPS) };
  const rec = recordingContext();
  const input = withInput ? replaySource(syntheticLog(piece.aspect)) : undefined;
  createRunner(piece, run, rec.ctx, PROBE_WIDTH_PX, undefined, input).finish();
  return rec.hash();
}

/** Hash of every registered piece version x (featured + snapshotCodes), plus a synthetic-input run for interactive pieces. */
export function runProbe(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const piece of allVersions()) {
    const codes = [...new Set([...piece.featured, ...(piece.snapshotCodes ?? [])])];
    for (const code of codes) {
      const key = `${piece.slug}@v${piece.version}:${code}`;
      out[key] = hashRun(piece, code, false);
      if (piece.interactive) out[`${key}+input`] = hashRun(piece, code, true);
    }
  }
  return out;
}
