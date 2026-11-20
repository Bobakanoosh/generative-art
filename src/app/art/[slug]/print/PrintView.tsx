'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { initialGeneration, resolvePiece } from '@/lib/piece/generationState';
import { encodeGeneration } from '@/lib/piece/share';
import {
  CAPTION_IN,
  DEFAULT_PAPER_ID,
  layoutPrint,
  MARGIN_IN,
  PAPER_SIZES,
  paperById,
  PRINT_DPI,
  printPageCss,
  shortenMiddle,
} from '@/lib/print/paper';
import { printReady, releaseTileCanvases, type PrintProgress } from '@/lib/print/progress';
import { BLEED_PX, flattenOnPaper, MAX_TILE_PX, planTiles, withBleed } from '@/lib/print/tiles';
import { renderGeneration } from '@/lib/render/runner';

/** CSS pixels per inch. */
const CSS_PX_PER_IN = 96;
const CAPTION_TITLE_PT = 8;
const CAPTION_CODE_PT = 6;
/** Rough advance of a monospace glyph, as a fraction of its point size. */
const MONO_ADVANCE = 0.62;

interface PrintViewProps {
  slug: string;
  initialCode: string | null;
  initialSeed: string;
}

/** Let the browser paint (the progress text) between tiles. */
const yieldToBrowser = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export default function PrintView({ slug, initialCode, initialSeed }: PrintViewProps) {
  const piece = useMemo(() => resolvePiece(slug, initialCode)!, [slug, initialCode]);
  const { gen, issues } = useMemo(
    () => initialGeneration(piece, initialCode, initialSeed),
    [piece, initialCode, initialSeed],
  );
  const code = useMemo(() => encodeGeneration(gen), [gen]);

  const [paperId, setPaperId] = useState(DEFAULT_PAPER_ID);
  const [caption, setCaption] = useState(true);
  const layout = layoutPrint(piece.aspect, paperById(paperId), caption);
  const { artWPx, artHPx } = layout;
  // Room for the bleed keeps every canvas within MAX_TILE_PX.
  const tiles = useMemo(
    () => planTiles(artWPx, artHPx, MAX_TILE_PX - BLEED_PX),
    [artWPx, artHPx],
  );

  const artRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<PrintProgress>({ plan: tiles, done: 0, error: null });

  // Each tile is its own canvas: one huge canvas would exceed browser limits at 300 DPI.
  useEffect(() => {
    const host = artRef.current;
    if (!host) return;
    let cancelled = false;
    releaseTileCanvases(host);
    const run = async () => {
      setProgress({ plan: tiles, done: 0, error: null });
      await yieldToBrowser();
      for (let i = 0; i < tiles.length; i++) {
        if (cancelled) return;
        // Later tiles (right/below) are appended on top of this one's bleed.
        const { px, logical } = withBleed(tiles[i], artWPx, artHPx);
        const canvas = document.createElement('canvas');
        canvas.width = px.w;
        canvas.height = px.h;
        Object.assign(canvas.style, {
          position: 'absolute',
          display: 'block',
          left: `${(px.x / artWPx) * 100}%`,
          top: `${(px.y / artHPx) * 100}%`,
          width: `${(px.w / artWPx) * 100}%`,
          height: `${(px.h / artHPx) * 100}%`,
        });
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
        renderGeneration(piece, gen, ctx, px.w, logical);
        flattenOnPaper(ctx);
        host.appendChild(canvas);
        setProgress({ plan: tiles, done: i + 1, error: null });
        await yieldToBrowser();
      }
    };
    run().catch((err: unknown) => {
      if (!cancelled) setProgress((p) => ({ ...p, error: err instanceof Error ? err.message : String(err) }));
    });
    return () => {
      cancelled = true;
      releaseTileCanvases(host);
    };
  }, [piece, gen, tiles, artWPx, artHPx]);

  // Scale the on-screen preview so the whole sheet fits below the controls.
  const previewRef = useRef<HTMLDivElement>(null);
  const [fitBox, setFitBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const style = getComputedStyle(el);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      setFitBox({ w: el.clientWidth - padX, h: Math.max(200, window.innerHeight - top - 32) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const pageWCss = layout.pageWIn * CSS_PX_PER_IN;
  const pageHCss = layout.pageHIn * CSS_PX_PER_IN;
  const scale = fitBox ? Math.min(1, fitBox.w / pageWCss, fitBox.h / pageHCss) : 0;

  const ready = printReady(progress, tiles);
  const codeChars = Math.floor((layout.artWIn * 72) / (CAPTION_CODE_PT * MONO_ADVANCE));

  return (
    <div className="flex flex-1 flex-col">
      <style>{printPageCss(layout.pageWIn, layout.pageHIn)}</style>
      <div className="flex flex-wrap items-center gap-3 border-b border-foreground/10 p-4 text-sm print:hidden">
        {/* Plain <a>: a full load re-initialises the piece page from the URL. */}
        <a href={`/art/${encodeURIComponent(slug)}?g=${code}`} className="underline opacity-70 hover:opacity-100">
          ← Back
        </a>
        <span className="font-semibold">{piece.title}</span>
        <label className="flex items-center gap-1.5">
          Paper
          <select
            value={paperId}
            onChange={(e) => setPaperId(e.target.value)}
            className="rounded border border-foreground/20 bg-background px-2 py-1"
          >
            {PAPER_SIZES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={caption} onChange={(e) => setCaption(e.target.checked)} />
          Caption
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          className="rounded border border-foreground/20 px-2.5 py-1.5 hover:bg-foreground/10 disabled:opacity-40"
        >
          Print / Save as PDF
        </button>
        <span role="status" aria-live="polite" className="opacity-60">
          {progress.error
            ? null
            : ready
              ? `${layout.orientation} · ${artWPx} × ${artHPx} px at ${PRINT_DPI} DPI`
              : `Rendering ${progress.plan === tiles ? progress.done : 0}/${tiles.length}`}
        </span>
        {issues.length > 0 && (
          <p role="alert" className="w-full text-red-600 dark:text-red-400">
            {issues.join(' · ')}
          </p>
        )}
        {progress.error && (
          <p role="alert" className="w-full text-red-600 dark:text-red-400">
            Render failed: {progress.error}
          </p>
        )}
      </div>

      <div ref={previewRef} className="print-preview flex flex-1 justify-center p-4">
        <div
          className="print-preview"
          style={{ width: pageWCss * scale, height: pageHCss * scale, visibility: fitBox ? 'visible' : 'hidden' }}
        >
          <div
            className="print-sheet flex flex-col items-center justify-center overflow-hidden bg-white text-neutral-800 shadow-lg"
            style={{
              width: `${layout.pageWIn}in`,
              height: `${layout.pageHIn}in`,
              padding: `${MARGIN_IN}in`,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              printColorAdjust: 'exact',
              WebkitPrintColorAdjust: 'exact',
            }}
          >
            <div
              ref={artRef}
              className="relative shrink-0"
              style={{ width: `${layout.artWIn}in`, height: `${layout.artHIn}in` }}
              role="img"
              aria-label={piece.title}
            />
            {caption && (
              <div
                data-testid="print-caption"
                className="flex shrink-0 flex-col justify-end overflow-hidden whitespace-nowrap leading-tight"
                style={{ width: `${layout.artWIn}in`, height: `${CAPTION_IN}in` }}
              >
                <p style={{ fontSize: `${CAPTION_TITLE_PT}pt` }}>
                  <span className="font-semibold">{piece.title}</span>
                  <span className="opacity-70">
                    {' '}
                    · v{gen.v} · seed {gen.s}
                  </span>
                </p>
                <p className="font-mono opacity-60" style={{ fontSize: `${CAPTION_CODE_PT}pt` }} title={code}>
                  {shortenMiddle(code, codeChars)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
