'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createRng } from '@/lib/art/rng';
import {
  generationReducer,
  initialGeneration,
  isPiecePath,
  resolvePiece,
  type GenerationState,
} from './generationState';
import { encodeGeneration, newSeed } from './share';
import type { PieceDefinition } from './types';
import { getPiece } from '@/pieces';

/** How the next generation change is written to the address bar. */
type HistoryMode = 'push' | 'replace-now' | 'replace-debounced';

const URL_DEBOUNCE_MS = 250;
/** Param tweaks (slider drags) re-render after this quiet period; button actions render at once. */
export const PARAM_RENDER_DEBOUNCE_MS = 120;

function currentUrlCode(): string | null {
  return new URL(window.location.href).searchParams.get('g');
}

/**
 * The only place the hook writes to history. No-op unless the address bar is
 * still this piece's page (e.g. not after a client-side Back to the gallery)
 * and doesn't already hold `code`.
 */
function writeUrl(method: 'pushState' | 'replaceState', slug: string, code: string): void {
  const url = new URL(window.location.href);
  if (!isPiecePath(url.pathname, slug)) return;
  if (url.searchParams.get('g') === code) return;
  url.searchParams.set('g', code);
  window.history[method](null, '', url.pathname + url.search + url.hash);
}

export interface UseGeneration {
  piece: PieceDefinition;
  state: GenerationState;
  /** Share code of the current generation. */
  code: string;
  /** Delay before the canvas should re-render for the latest change. */
  renderDelayMs: number;
  regenerate(): void;
  randomize(): void;
  reset(): void;
  setParam(key: string, value: unknown): void;
  dismissIssues(): void;
}

/**
 * Generation state for one piece page, kept in sync with `?g=`:
 * button actions push a history entry, param tweaks replace the current one
 * (debounced), and back/forward restores the generation from the URL.
 */
export function useGeneration(slug: string, initialCode: string | null, initialSeed: string): UseGeneration {
  const [state, dispatch] = useReducer(generationReducer, null, (): GenerationState => {
    const piece = resolvePiece(slug, initialCode);
    if (!piece) throw new Error(`Unknown piece: ${slug}`);
    return initialGeneration(piece, initialCode, initialSeed);
  });
  const [renderDelayMs, setRenderDelayMs] = useState(0);

  const piece = getPiece(slug, state.gen.v);
  if (!piece) throw new Error(`Unknown piece: ${slug} v${state.gen.v}`);
  const { schema } = piece;

  const code = useMemo(() => encodeGeneration(state.gen), [state.gen]);

  // --- address bar sync -----------------------------------------------------
  // Mount canonicalizes the URL (e.g. bare /art/slug or a repaired link) in place.
  const historyMode = useRef<HistoryMode>('replace-now');
  const pendingCode = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flushPending = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const pending = pendingCode.current;
    pendingCode.current = null;
    if (pending !== null) writeUrl('replaceState', slug, pending);
  }, [slug]);

  const dropPending = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    pendingCode.current = null;
  }, []);

  // Every write compares against the live URL, so re-running (Strict Mode) is a no-op.
  useEffect(() => {
    switch (historyMode.current) {
      case 'push':
        flushPending(); // land the last tweak on the entry we are leaving
        writeUrl('pushState', slug, code);
        break;
      case 'replace-now':
        dropPending();
        writeUrl('replaceState', slug, code);
        break;
      case 'replace-debounced':
        pendingCode.current = code;
        clearTimeout(timer.current);
        timer.current = setTimeout(flushPending, URL_DEBOUNCE_MS);
        break;
    }
  }, [code, slug, flushPending, dropPending]);

  // On unmount the URL may already belong to the next page; never write to it.
  useEffect(() => dropPending, [dropPending]);

  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    const onPopState = () => {
      // A pending replace belongs to the entry we just left; it can no longer be written.
      dropPending();
      // Back/forward to another page (gallery, another piece): not ours to load.
      if (!isPiecePath(window.location.pathname, slug)) return;
      const urlCode = currentUrlCode();
      if (urlCode === codeRef.current) return;
      const target = resolvePiece(slug, urlCode);
      if (!target) return;
      historyMode.current = 'replace-now'; // no-op when the URL already holds this code
      setRenderDelayMs(0);
      dispatch({ type: 'load', state: initialGeneration(target, urlCode, newSeed()) });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [slug, dropPending]);

  // --- actions ----------------------------------------------------------------
  const regenerate = useCallback(() => {
    historyMode.current = 'push';
    setRenderDelayMs(0);
    dispatch({ type: 'regenerate', seed: newSeed() });
  }, []);

  const randomize = useCallback(() => {
    const seed = newSeed();
    historyMode.current = 'push';
    setRenderDelayMs(0);
    // A second fresh seed drives the param choices so they don't correlate with the image seed.
    dispatch({ type: 'randomize', schema, seed, rng: createRng(newSeed()) });
  }, [schema]);

  // Reset restores default params on the current seed, so the composition stays recognisable.
  const seed = state.gen.s;
  const reset = useCallback(() => {
    historyMode.current = 'push';
    setRenderDelayMs(0);
    dispatch({ type: 'reset', schema, seed });
  }, [schema, seed]);

  const setParam = useCallback(
    (key: string, value: unknown) => {
      historyMode.current = 'replace-debounced';
      setRenderDelayMs(PARAM_RENDER_DEBOUNCE_MS);
      dispatch({ type: 'setParam', schema, key, value });
    },
    [schema],
  );

  const dismissIssues = useCallback(() => dispatch({ type: 'dismissIssues' }), []);

  return { piece, state, code, renderDelayMs, regenerate, randomize, reset, setParam, dismissIssues };
}
