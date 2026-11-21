import { describe, expect, it } from 'vitest';
import { GALLERY_GAP_PX, GROUP_MIN_PX, galleryGroupBox, galleryGroupStyle } from './galleryLayout';

describe('galleryGroupBox (the lg grid in numbers)', () => {
  it.each([
    ['4:5 portrait (flow-ribbons)', 0.8],
    ['1:1 square (murmuration)', 1],
    ['3:2 landscape', 1.5],
  ])('%s: the two follow-ups stack exactly as tall as the primary, at the piece aspect (no letterbox, no crop)', (_n, aspect) => {
    for (const width of [640, 819, 1120]) {
      const b = galleryGroupBox(aspect, width);
      expect(b.primaryWidth + GALLERY_GAP_PX + b.followUpWidth).toBeCloseTo(width);
      expect(b.stackHeight).toBeCloseTo(b.primaryHeight);
      expect(b.followUpHeight).toBeCloseTo(b.followUpWidth / aspect);
    }
  });

  it('the follow-ups are smaller than the primary', () => {
    const b = galleryGroupBox(0.8, 819);
    expect(b.followUpWidth).toBeLessThan(b.primaryWidth / 2);
  });
});

describe('galleryGroupStyle', () => {
  it('sets the column template from the aspect and centres a group sized so the primary fits the viewport', () => {
    const s = galleryGroupStyle(0.8) as Record<string, string | number>;
    expect(s['--a']).toBe(0.8);
    expect(s['--cols']).toBe(`minmax(0,1fr) calc((100% - ${GALLERY_GAP_PX}px * (1 + 0.8)) / 3)`);
    // Floor: a short viewport never shrinks the group below GROUP_MIN_PX.
    expect(s['--group-max']).toMatch(new RegExp(`^max\\(${GROUP_MIN_PX}px, calc\\(`));
  });

  it('the CSS group width puts the primary at the available height (1440×900, 4:5)', () => {
    // available height H = 900 - 56 header - 168 chrome = 676; primary = H * a.
    const H = 676;
    const a = 0.8;
    const groupWidth = 1.5 * H * a + GALLERY_GAP_PX * (1 - a / 2);
    expect(galleryGroupBox(a, groupWidth).primaryHeight).toBeCloseTo(H);
  });
});
