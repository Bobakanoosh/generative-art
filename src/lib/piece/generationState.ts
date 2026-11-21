import type { Rng } from '@/lib/art/rng';
import { defaultsOf, randomizeParams, validateParams } from './schema';
import { decodeGeneration } from './share';
import type { Generation, ParamSchema, PieceDefinition } from './types';
import { getPiece } from '@/pieces';
import { isLive } from '@/lib/live/live';

export const INVALID_LINK_ISSUE = 'Invalid link — showing defaults';

/**
 * How the canvas should show the latest generation: `'play'` animates the
 * build, `'instant'` draws it straight to the end (live slider drags).
 */
export type Motion = 'play' | 'instant';

export interface GenerationState {
  gen: Generation;
  /** Human-readable problems with the loaded link; shown as a dismissible notice. */
  issues: string[];
  motion: Motion;
}

/**
 * Actions that need the param schema carry it, so the reducer stays a pure
 * `(state, action) => state` with no registry lookups. Randomness comes in
 * from the caller (`seed`, `rng`) for the same reason.
 */
export type GenerationAction =
  | { type: 'regenerate'; seed: string }
  | { type: 'randomize'; schema: ParamSchema; seed: string; rng: Rng }
  | { type: 'reset'; schema: ParamSchema; seed: string }
  /** `live`: an in-progress change (slider drag) that draws instantly; a commit replays the build. */
  | { type: 'setParam'; schema: ParamSchema; key: string; value: unknown; live: boolean }
  | { type: 'load'; state: GenerationState }
  /** Leave a captured moment (endless piece with `n`) for the same generation running live. */
  | { type: 'goLive' }
  | { type: 'dismissIssues' };

/**
 * Every user action starts a fresh, complete generation: `regenerate`,
 * `randomize`, `setParam` and `reset` all drop the stop step `n`, so a
 * mid-build link doesn't leave every later generation half-drawn.
 */
export function generationReducer(state: GenerationState, action: GenerationAction): GenerationState {
  switch (action.type) {
    case 'regenerate':
      return { ...state, gen: { v: state.gen.v, s: action.seed, p: state.gen.p }, motion: 'play' };
    case 'randomize':
      return {
        ...state,
        gen: { v: state.gen.v, s: action.seed, p: randomizeParams(action.schema, action.rng, state.gen.p) },
        motion: 'play',
      };
    case 'reset':
      return { gen: { v: state.gen.v, s: action.seed, p: defaultsOf(action.schema) }, issues: [], motion: 'play' };
    case 'setParam': {
      if (!Object.prototype.hasOwnProperty.call(action.schema, action.key)) return state;
      const { params } = validateParams(action.schema, { ...state.gen.p, [action.key]: action.value });
      // Always a new gen object, so a commit with the value already set by a live drag still replays.
      return { ...state, gen: { v: state.gen.v, s: state.gen.s, p: params }, motion: action.live ? 'instant' : 'play' };
    }
    case 'load':
      return { ...action.state, motion: 'play' };
    case 'goLive':
      if (state.gen.n === undefined) return state;
      return { ...state, gen: { v: state.gen.v, s: state.gen.s, p: state.gen.p }, motion: 'play' };
    case 'dismissIssues':
      return state.issues.length ? { ...state, issues: [] } : state;
  }
}

/**
 * A live piece stopped at step 0 is an empty canvas, not a moment worth
 * showing: `n = 0` on an endless/interactive generation means "no stop step"
 * (open it running live). Build pieces keep `n = 0` (the start of the build).
 */
function runsLive(piece: PieceDefinition, gen: Generation): boolean {
  try {
    return isLive(piece, gen);
  } catch {
    return false; // setup threw: the build canvas shows the error
  }
}

/**
 * Build the starting state for `piece` from a share code. The caller resolves
 * `piece` to the code's version when that version exists (older versions stay
 * viewable); a code for any other version is treated as invalid.
 */
export function initialGeneration(
  piece: PieceDefinition,
  code: string | null,
  seed: string,
): GenerationState {
  const defaults: Generation = { v: piece.version, s: seed, p: defaultsOf(piece.schema) };
  if (code === null) return { gen: defaults, issues: [], motion: 'play' };

  const decoded = decodeGeneration(code);
  if (!decoded || decoded.v !== piece.version) {
    return { gen: defaults, issues: [INVALID_LINK_ISSUE], motion: 'play' };
  }

  const { params, issues } = validateParams(piece.schema, decoded.p);
  const gen: Generation = { v: decoded.v, s: decoded.s, p: params };
  if (decoded.n !== undefined && !(decoded.n === 0 && runsLive(piece, gen))) gen.n = decoded.n;
  return { gen, issues, motion: 'play' };
}

/**
 * The piece version a share code names, if that version exists; otherwise the
 * latest. Shared by the server page and the client hook so both pick the same.
 */
export function resolvePiece(
  slug: string,
  code: string | null,
  lookup: (slug: string, version?: number) => PieceDefinition | undefined = getPiece,
): PieceDefinition | undefined {
  const decoded = code ? decodeGeneration(code) : null;
  return (decoded ? lookup(slug, decoded.v) : undefined) ?? lookup(slug);
}

/**
 * Whether `pathname` is this piece's page (`/art/<slug>`), tolerant of
 * percent-encoding and a trailing slash. Guards history writes so the hook
 * never touches another page's URL.
 */
export function isPiecePath(pathname: string, slug: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path === `/art/${slug}`;
}
