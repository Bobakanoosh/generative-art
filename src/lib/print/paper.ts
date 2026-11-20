/** Paper sizes, layout and caption text for the print page. All lengths are inches. */

export interface Paper {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
}

/** Portrait dimensions; `layoutPrint` turns the page when landscape fits the art better. */
export const PAPER_SIZES: readonly Paper[] = [
  { id: 'letter', label: 'Letter (8.5 × 11 in)', widthIn: 8.5, heightIn: 11 },
  { id: 'a4', label: 'A4 (210 × 297 mm)', widthIn: 8.27, heightIn: 11.69 },
  { id: 'a3', label: 'A3 (297 × 420 mm)', widthIn: 11.69, heightIn: 16.54 },
  { id: '8x10', label: '8 × 10 in', widthIn: 8, heightIn: 10 },
  { id: '11x14', label: '11 × 14 in', widthIn: 11, heightIn: 14 },
  { id: '12x16', label: '12 × 16 in', widthIn: 12, heightIn: 16 },
  { id: '18x24', label: '18 × 24 in', widthIn: 18, heightIn: 24 },
];

export const DEFAULT_PAPER_ID = 'letter';
export const PRINT_DPI = 300;
export const MARGIN_IN = 0.5;
export const CAPTION_IN = 0.35;

export function paperById(id: string): Paper {
  return PAPER_SIZES.find((p) => p.id === id) ?? PAPER_SIZES.find((p) => p.id === DEFAULT_PAPER_ID)!;
}

export interface PrintLayout {
  orientation: 'portrait' | 'landscape';
  pageWIn: number;
  pageHIn: number;
  artWIn: number;
  artHIn: number;
  /** Art size in device pixels at PRINT_DPI; `artHPx` follows `artWPx / aspect` so the aspect holds within 1 px. */
  artWPx: number;
  artHPx: number;
}

function fit(aspect: number, pageWIn: number, pageHIn: number, caption: boolean) {
  const availW = pageWIn - 2 * MARGIN_IN;
  const availH = pageHIn - 2 * MARGIN_IN - (caption ? CAPTION_IN : 0);
  const artWIn = Math.min(availW, availH * aspect);
  return { pageWIn, pageHIn, artWIn, artHIn: artWIn / aspect };
}

/**
 * Largest art of the given aspect (width / height) inside the page margins,
 * leaving room for the caption below it. Picks whichever orientation gives the
 * larger art area; a tie stays portrait.
 */
export function layoutPrint(aspect: number, paper: Paper, caption: boolean): PrintLayout {
  const portrait = fit(aspect, paper.widthIn, paper.heightIn, caption);
  const landscape = fit(aspect, paper.heightIn, paper.widthIn, caption);
  const useLandscape = landscape.artWIn * landscape.artHIn > portrait.artWIn * portrait.artHIn + 1e-9;
  const l = useLandscape ? landscape : portrait;
  const artWPx = Math.max(1, Math.round(l.artWIn * PRINT_DPI));
  return {
    orientation: useLandscape ? 'landscape' : 'portrait',
    ...l,
    artWPx,
    artHPx: Math.max(1, Math.round(artWPx / aspect)),
  };
}

/** `text` cut to at most `max` characters by replacing its middle with an ellipsis. */
export function shortenMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = Math.max(0, max - 1);
  const head = Math.ceil(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
}

/**
 * Print stylesheet for the chosen sheet: the `@page` size (margins live inside
 * the sheet itself), and print overrides that drop the on-screen preview's
 * scaling, shadow and padding so the sheet fills exactly one page.
 */
export function printPageCss(pageWIn: number, pageHIn: number): string {
  return `@page { size: ${pageWIn}in ${pageHIn}in; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; min-height: 0 !important; height: auto !important; }
  .print-preview { width: auto !important; height: auto !important; padding: 0 !important; display: block !important; }
  .print-sheet { transform: none !important; box-shadow: none !important; }
}`;
}

/** The print page for a generation (`code` is base64url, safe in a query string). */
export function printHref(slug: string, code: string): string {
  return `/art/${encodeURIComponent(slug)}/print?g=${code}`;
}
