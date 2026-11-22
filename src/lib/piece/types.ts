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
  /**
   * Optional shortcut for single-image renders (downloads, prints, previews)
   * of pieces whose old drawing fades away completely, e.g. veil trails that
   * reach the background exactly. `keep(params)` is how many final steps
   * still show in the image (undefined: no shortcut for these params);
   * `prime(ctx, params)` paints the canvas as step 0 would, in pixel space.
   * Earlier steps still run (the simulation needs them) with drawing
   * switched off. Must give byte-identical images; see src/lib/render/fastForward.ts.
   */
  fastForward?: {
    keep(params: Params): number | undefined;
    prime(ctx: CanvasRenderingContext2D, params: Params): void;
  };
  setup(params: Params, rng: Rng): S;
  step(ctx: CanvasRenderingContext2D, state: S, i: number, input: InputFrame): void;
  steps(state: S): number;
}

export const EMPTY_INPUT: InputFrame = { pointer: null, keys: [] };
