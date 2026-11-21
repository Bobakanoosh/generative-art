import { describe, expect, it } from 'vitest';
import type { PieceDefinition } from '@/lib/piece/types';
import { allVersions } from '@/pieces';
import { captureFallbackAspect } from './fallbackAspect';

const def = (aspect: number, interactive: boolean) => ({ aspect, interactive }) as PieceDefinition;

describe('captureFallbackAspect (the /c/<id> loading placeholder, before the record says which piece)', () => {
  it('is the aspect every capturable (interactive) piece shares, so the placeholder matches the loaded box', () => {
    expect(captureFallbackAspect([def(0.8, false), def(1.5, true), def(1.5, true)])).toBe(1.5);
  });

  it('ignores non-interactive pieces (they cannot be captured)', () => {
    expect(captureFallbackAspect([def(0.8, false), def(1, true)])).toBe(1);
  });

  it('is undefined when capturable pieces disagree or there are none (no art-shaped box is guessed)', () => {
    expect(captureFallbackAspect([def(1, true), def(0.8, true)])).toBeUndefined();
    expect(captureFallbackAspect([def(0.8, false)])).toBeUndefined();
  });

  it('for the registered pieces it equals murmuration\'s aspect (the only interactive piece)', () => {
    const interactive = allVersions().filter((d) => d.interactive);
    expect(captureFallbackAspect(allVersions())).toBe(interactive[0].aspect);
  });
});
