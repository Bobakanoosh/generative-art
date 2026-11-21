import { describe, expect, it, vi } from 'vitest';
import type { Generation } from '@/lib/piece/types';
import type { LiveSim } from './live';
import { takeMoment, type LiveHandle } from './handle';

function fakeSim(n: number): LiveSim {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    restart: vi.fn(),
    status: () => ({ index: n, playing: true, limited: false, catchingUp: false, inputFull: false, epoch: 0 }),
    subscribe: () => () => {},
    capture: vi.fn(() => ({ n, input: { p: [[3, 10, 10, 1]], k: [] } })),
    snapshot: vi.fn(() => ({ n, input: { p: [[3, 10, 10, 1]], k: [] } })),
    destroy: vi.fn(),
  };
}

const genA: Generation = { v: 1, s: 'a', p: { trail: 0.08 } };
const genB: Generation = { v: 1, s: 'a', p: { trail: 0.02 } };

describe('takeMoment', () => {
  it("captures the current sim with that sim's own generation", () => {
    const handle: LiveHandle = { sim: fakeSim(120), gen: genA };
    expect(takeMoment(handle, handle)).toEqual({ gen: genA, moment: { n: 120, input: { p: [[3, 10, 10, 1]], k: [] } } });
    expect(handle.sim.capture).toHaveBeenCalledTimes(1);
  });

  it('refuses a sim that is no longer current (gen changed or resized), without touching it', () => {
    const old: LiveHandle = { sim: fakeSim(500), gen: genA };
    const next: LiveHandle = { sim: fakeSim(3), gen: genB };
    expect(takeMoment(next, old)).toBeNull();
    expect(old.sim.capture).not.toHaveBeenCalled();
    expect(next.sim.capture).not.toHaveBeenCalled();
  });

  it('refuses while no sim is running (between a param change and the debounced new sim)', () => {
    const old: LiveHandle = { sim: fakeSim(500), gen: genA };
    expect(takeMoment(null, old)).toBeNull();
    expect(takeMoment(null, null)).toBeNull();
    expect(old.sim.capture).not.toHaveBeenCalled();
  });
});
