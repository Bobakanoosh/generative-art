import { describe, expect, it } from 'vitest';
import { ART_STAGE_CHROME_PX, BAR_GAP_PX, BAR_H_PX, STAGE_PAD_Y_PX, artFrameBox, artFrameWidth, stageExtraPx } from './artFrame';

describe('artFrameWidth', () => {
  it('fits the art to the viewport height minus header, stage padding and the 40 px bar row', () => {
    expect(BAR_H_PX).toBe(40);
    expect(ART_STAGE_CHROME_PX).toBe(STAGE_PAD_Y_PX + BAR_GAP_PX + BAR_H_PX);
    expect(artFrameWidth(0.8)).toBe(
      `min(100%, calc((100dvh - var(--header-h) - ${ART_STAGE_CHROME_PX}px - var(--stage-extra, 0px)) * 0.8))`,
    );
    expect(artFrameWidth(1)).toBe(
      `min(100%, calc((100dvh - var(--header-h) - ${ART_STAGE_CHROME_PX}px - var(--stage-extra, 0px)) * 1))`,
    );
  });
});

describe('artFrameBox (the CSS above, in numbers)', () => {
  // 1440×900 desktop: stage = 1440 - 360 panel wide, 900 - 56 header tall.
  const stage = { width: 1080, height: 844 };

  it.each([
    ['4:5 (flow-ribbons)', 0.8],
    ['1:1 (murmuration)', 1],
  ])('%s fills the padded stage height exactly, so the art + bar block is vertically centred', (_name, aspect) => {
    const box = artFrameBox(aspect, stage.width, stage.height);
    expect(box.artHeight).toBeCloseTo(844 - ART_STAGE_CHROME_PX);
    expect(box.artWidth).toBeCloseTo((844 - ART_STAGE_CHROME_PX) * aspect);
    // art + gap + bar == stage minus its vertical padding: equal space above and below.
    expect(box.blockHeight).toBeCloseTo(stage.height - STAGE_PAD_Y_PX);
  });

  it('is width-limited on a narrow stage (phone): full width, height from the aspect', () => {
    const box = artFrameBox(0.8, 358, 788);
    expect(box.artWidth).toBe(358);
    expect(box.artHeight).toBeCloseTo(358 / 0.8);
  });
});

describe('stageExtraPx (notices on the stage shrink the art instead of overflowing it)', () => {
  it('is 0 when the stage holds only the art and its bar row', () => {
    expect(stageExtraPx({ contentHeight: 732 + BAR_GAP_PX + BAR_H_PX, artHeight: 732 })).toBe(0);
  });

  it('is the height of everything else: notices above, lines under the bar, and the gaps', () => {
    // A 38 px notice + 12 px gap above, a 32 px "captured moment" line + 8 px gap under the bar.
    const contentHeight = 38 + 12 + 732 + BAR_GAP_PX + BAR_H_PX + 8 + 32;
    expect(stageExtraPx({ contentHeight, artHeight: 732 })).toBe(90);
  });

  it('never goes negative and rounds to whole pixels (no resize feedback loop)', () => {
    expect(stageExtraPx({ contentHeight: 10, artHeight: 732 })).toBe(0);
    expect(stageExtraPx({ contentHeight: 732 + 48 + 20.4, artHeight: 732 })).toBe(20);
  });

  it('with the extra subtracted, the whole stage content fits the padded stage again', () => {
    const extra = 90;
    const stage = { width: 1080, height: 844 };
    const art = (stage.height - ART_STAGE_CHROME_PX - extra) * 1;
    expect(art + BAR_GAP_PX + BAR_H_PX + extra).toBeCloseTo(stage.height - STAGE_PAD_Y_PX);
  });
});
