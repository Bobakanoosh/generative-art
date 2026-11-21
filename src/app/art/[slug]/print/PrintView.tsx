'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InputLog } from '@/lib/input/log';
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
import { renderPrintTile } from '@/lib/print/renderTile';
import { BLEED_PX, MAX_TILE_PX, planTiles, withBleed } from '@/lib/print/tiles';
import { Segmented } from '@/components/controls/Segmented';
import { Toggle } from '@/components/controls/Toggle';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

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
  /** Recorded input to replay in every tile (a stored capture). Keep its identity stable. */
  input?: InputLog;
  /** Caption code line instead of the share code (a capture prints `c/<id>`). */
  captionCode?: string;
  /** Back link instead of the piece page for the code (a capture links to `/c/<id>`). */
  backHref?: string;
}

/** Let the browser paint (the progress text) between tiles. */
const yieldToBrowser = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export default function PrintView({ slug, initialCode, initialSeed, input, captionCode, backHref }: PrintViewProps) {
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
        const bled = withBleed(tiles[i], artWPx, artHPx);
        const { px } = bled;
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
        renderPrintTile(piece, gen, ctx, bled, input);
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
  }, [piece, gen, tiles, artWPx, artHPx, input]);

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
      <div className="border-b border-line px-4 py-3 sm:px-6 print:hidden">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {/* Plain <a>: a full load re-initialises the piece page from the URL. */}
          <a
            href={backHref ?? `/art/${encodeURIComponent(slug)}?g=${code}`}
            className="inline-flex items-center gap-2 text-[13px] text-muted transition-colors duration-150 ease-out hover:text-fg"
          >
            <Icon name="arrow-left" size={16} />
            Back
          </a>
          <h1 className="font-serif text-2xl leading-none text-fg">{piece.title}</h1>
          <div>
            <Segmented
              id="print-paper"
              label="Paper"
              value={paperById(paperId).label}
              options={PAPER_SIZES.map((p) => p.label)}
              onChange={(label) => {
                const paper = PAPER_SIZES.find((p) => p.label === label);
                if (paper) setPaperId(paper.id);
              }}
            />
          </div>
          <div>
            <Toggle id="print-caption" label="Caption" value={caption} onChange={setCaption} />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span role="status" aria-live="polite" className="font-mono text-xs tabular-nums text-muted">
              {progress.error
                ? null
                : ready
                  ? `${layout.orientation} · ${artWPx} × ${artHPx} px at ${PRINT_DPI} DPI`
                  : `Rendering ${progress.plan === tiles ? progress.done : 0}/${tiles.length}`}
            </span>
            <Button variant="primary" onClick={() => window.print()} disabled={!ready}>
              <Icon name="print" size={16} />
              Print or save as PDF
            </Button>
          </div>
        </div>
        {issues.length > 0 && (
          <p role="alert" className="mt-3 text-[13px] text-fg">
            {issues.join(' · ')}
          </p>
        )}
        {progress.error && (
          <p role="alert" className="mt-3 text-[13px] text-fg">
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
            className="print-sheet flex flex-col items-center justify-center overflow-hidden bg-white text-neutral-800"
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
                <p
                  className="font-mono opacity-60"
                  style={{ fontSize: `${CAPTION_CODE_PT}pt` }}
                  title={captionCode ?? code}
                >
                  {shortenMiddle(captionCode ?? code, codeChars)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
