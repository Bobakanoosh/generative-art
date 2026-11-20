import { describe, expect, it } from 'vitest';
import {
  CAPTION_IN,
  layoutPrint,
  MARGIN_IN,
  PAPER_SIZES,
  paperById,
  PRINT_DPI,
  printHref,
  printPageCss,
  shortenMiddle,
} from './paper';

const letter = paperById('letter');

describe('PAPER_SIZES', () => {
  it('has the seven sizes, portrait, in inches', () => {
    expect(PAPER_SIZES.map((p) => p.id)).toEqual(['letter', 'a4', 'a3', '8x10', '11x14', '12x16', '18x24']);
    for (const p of PAPER_SIZES) expect(p.widthIn).toBeLessThan(p.heightIn);
    expect(paperById('a3')).toMatchObject({ widthIn: 11.69, heightIn: 16.54 });
  });

  it('paperById falls back to letter for unknown ids', () => {
    expect(paperById('nope').id).toBe('letter');
  });

  it('uses the print constants', () => {
    expect([PRINT_DPI, MARGIN_IN, CAPTION_IN]).toEqual([300, 0.5, 0.35]);
  });
});

describe('layoutPrint', () => {
  it('fits a portrait piece on letter with a caption, preserving aspect', () => {
    const l = layoutPrint(0.8, letter, true);
    expect(l.orientation).toBe('portrait');
    expect([l.pageWIn, l.pageHIn]).toEqual([8.5, 11]);
    expect(l.artWIn).toBeLessThanOrEqual(8.5 - 1 + 1e-9);
    expect(l.artHIn).toBeLessThanOrEqual(11 - 1 - 0.35 + 1e-9);
    // One dimension is limiting: the art touches it.
    expect(Math.max(l.artWIn / 7.5, l.artHIn / 9.65)).toBeCloseTo(1, 9);
    expect(l.artWPx).toBe(Math.round(l.artWIn * PRINT_DPI));
    expect(Math.abs(l.artHPx - l.artWPx / 0.8)).toBeLessThanOrEqual(1);
  });

  it('leaves no caption space when the caption is off', () => {
    const on = layoutPrint(0.5, letter, true);
    const off = layoutPrint(0.5, letter, false);
    expect(off.artHIn).toBeCloseTo(10, 9);
    expect(on.artHIn).toBeCloseTo(9.65, 9);
  });

  it('turns a wide piece to landscape', () => {
    const l = layoutPrint(2, letter, false);
    expect(l.orientation).toBe('landscape');
    expect([l.pageWIn, l.pageHIn]).toEqual([11, 8.5]);
    expect(l.artWIn).toBeCloseTo(10, 9);
    expect(l.artHIn).toBeCloseTo(5, 9);
    expect([l.artWPx, l.artHPx]).toEqual([3000, 1500]);
  });

  it('keeps square art portrait (ties go to portrait)', () => {
    expect(layoutPrint(1, paperById('8x10'), false).orientation).toBe('portrait');
  });
});

describe('shortenMiddle', () => {
  it('leaves short text alone', () => {
    expect(shortenMiddle('abc', 10)).toBe('abc');
  });

  it('cuts long text in the middle with an ellipsis, to exactly max chars', () => {
    const s = shortenMiddle('abcdefghijklmnopqrstuvwxyz', 11);
    expect(s).toBe('abcde…vwxyz');
    expect(s.length).toBe(11);
  });
});

describe('printPageCss', () => {
  it('sets the page size and zero margin, and undoes the on-screen preview scaling for print', () => {
    const css = printPageCss(11, 8.5);
    expect(css).toContain('@page { size: 11in 8.5in; margin: 0; }');
    expect(css).toContain('@media print');
    expect(css).toContain('.print-sheet { transform: none !important');
  });
});

describe('printHref', () => {
  it('links to the print page with the share code', () => {
    expect(printHref('flow-ribbons', 'abc_-')).toBe('/art/flow-ribbons/print?g=abc_-');
    expect(printHref('a b', 'x')).toBe('/art/a%20b/print?g=x');
  });
});
