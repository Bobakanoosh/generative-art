import { describe, expect, it } from 'vitest';
import { SPEEDS } from './pacing';
import { SPEED_STORAGE_KEY, browserStorage, loadSpeed, saveSpeed } from './speedPreference';

/** Minimal in-memory Storage. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => {
      data.delete(k);
    },
    setItem: (k, v) => {
      data.set(k, String(v));
    },
  };
}

function throwingStorage(): Storage {
  const boom = () => {
    throw new Error('SecurityError');
  };
  return {
    get length(): number {
      return boom();
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  };
}

describe('loadSpeed', () => {
  it('returns every valid stored speed', () => {
    for (const speed of SPEEDS) {
      const storage = memoryStorage({ [SPEED_STORAGE_KEY]: String(speed) });
      expect(loadSpeed(storage, false)).toBe(speed);
      // A stored choice wins over the reduced-motion default.
      expect(loadSpeed(storage, true)).toBe(speed);
    }
  });

  it('ignores garbage and falls back to the default', () => {
    for (const raw of ['', 'fast', '3', '0', '1.0', ' 1', 'Instant', 'null']) {
      expect(loadSpeed(memoryStorage({ [SPEED_STORAGE_KEY]: raw }), false)).toBe(1);
    }
  });

  it('defaults to 1, or instant when reduced motion is preferred', () => {
    expect(loadSpeed(memoryStorage(), false)).toBe(1);
    expect(loadSpeed(memoryStorage(), true)).toBe('instant');
    expect(loadSpeed(undefined, false)).toBe(1);
    expect(loadSpeed(undefined, true)).toBe('instant');
  });

  it('falls back to the default when storage throws', () => {
    expect(loadSpeed(throwingStorage(), false)).toBe(1);
    expect(loadSpeed(throwingStorage(), true)).toBe('instant');
  });
});

describe('saveSpeed', () => {
  it('round-trips through loadSpeed', () => {
    const storage = memoryStorage();
    for (const speed of SPEEDS) {
      saveSpeed(storage, speed);
      expect(loadSpeed(storage, speed !== 'instant')).toBe(speed);
    }
  });

  it('never throws, even when storage does or is missing', () => {
    expect(() => saveSpeed(throwingStorage(), 2)).not.toThrow();
    expect(() => saveSpeed(undefined, 2)).not.toThrow();
  });
});

describe('browserStorage', () => {
  it('is undefined without a window (server / node)', () => {
    expect(typeof window).toBe('undefined');
    expect(browserStorage()).toBeUndefined();
  });
});
