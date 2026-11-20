import { describe, expect, it } from 'vitest';
import { printReady, releaseTileCanvases } from './progress';

describe('printReady', () => {
  const plan = [1, 2, 3, 4];

  it('is ready once every tile of the current plan is drawn without error', () => {
    expect(printReady({ plan, done: 4, error: null }, plan)).toBe(true);
    expect(printReady({ plan, done: 3, error: null }, plan)).toBe(false);
    expect(printReady({ plan, done: 4, error: 'boom' }, plan)).toBe(false);
  });

  it('is not ready while progress still describes the previous plan (paper or caption just changed)', () => {
    // The old run finished, but the new plan's run has not reset progress yet.
    expect(printReady({ plan, done: 4, error: null }, [1, 2, 3, 4, 5, 6])).toBe(false);
    // Same tile count after the change (e.g. Letter -> A4, both 2 x 2): still not the same plan.
    expect(printReady({ plan, done: 4, error: null }, [1, 2, 3, 4])).toBe(false);
  });
});

describe('releaseTileCanvases', () => {
  it('zeroes every canvas backing store before emptying the host', () => {
    const canvases = [
      { width: 2040, height: 2040 },
      { width: 500, height: 800 },
    ];
    const events: string[] = [];
    const host = {
      querySelectorAll: (sel: string) => {
        expect(sel).toBe('canvas');
        return canvases;
      },
      replaceChildren: () => {
        events.push(`cleared after ${canvases.map((c) => `${c.width}x${c.height}`).join(',')}`);
      },
    };
    releaseTileCanvases(host as unknown as ParentNode);
    expect(canvases).toEqual([
      { width: 0, height: 0 },
      { width: 0, height: 0 },
    ]);
    expect(events).toEqual(['cleared after 0x0,0x0']);
  });
});
