import { describe, expect, it } from 'vitest';
import { allVersions } from '@/pieces';
import { loopStepsValid } from '@/lib/video/liveClip';

describe('registered pieces', () => {
  it('declare loopSteps (if any) as a positive multiple of 4', () => {
    const bad = allVersions()
      .filter((p) => p.loopSteps !== undefined && !loopStepsValid(p.loopSteps))
      .map((p) => `${p.slug}@v${p.version}: ${p.loopSteps}`);
    expect(bad).toEqual([]);
  });
});
