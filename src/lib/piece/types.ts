import type { Rng } from '@/lib/art/rng';

export type ParamSpec =
  | { kind: 'number'; default: number; min: number; max: number; step?: number }
  | { kind: 'integer'; default: number; min: number; max: number }
  | { kind: 'boolean'; default: boolean }
  | { kind: 'color'; default: string } // '#rrggbb'
  | { kind: 'palette'; default: string[]; minColors?: number; maxColors?: number; presets?: string[][] }
  | { kind: 'select'; default: string; options: readonly string[] }
  | { kind: 'multiselect'; default: string[]; options: readonly string[]; minSelected?: number };

/** `randomize` defaults to true. */
export type ParamMeta = { label: string; description?: string; group?: string; randomize?: boolean };

export type ParamSchema = Record<string, ParamSpec & ParamMeta>;
export type Params = Record<string, unknown>;

/** Pointer/keys in logical drawing coordinates. */
export interface InputFrame {
  pointer: { x: number; y: number; down: boolean } | null;
  keys: string[];
}

export interface Generation {
  v: number;
  s: string;
  p: Params;
  n?: number;
}

export interface PieceDefinition<S = unknown> {
  slug: string;
  version: number;
  title: string;
  description?: string;
  aspect: number;
  schema: ParamSchema;
  interactive?: boolean;
  accumulates?: boolean;
  loopSteps?: number;
  phases?: { at: number; label: string }[];
  /** Share codes. */
  featured: string[];
  /**
   * Extra share codes that are only snapshot-tested, never shown: use them to
   * pin down params/modes the featured codes don't exercise. tests/snapshots.test.ts
   * hashes featured ∪ snapshotCodes.
   */
  snapshotCodes?: string[];
  /** Excluded from production. */
  local?: boolean;
  setup(params: Params, rng: Rng): S;
  step(ctx: CanvasRenderingContext2D, state: S, i: number, input: InputFrame): void;
  steps(state: S): number;
}

export const EMPTY_INPUT: InputFrame = { pointer: null, keys: [] };
