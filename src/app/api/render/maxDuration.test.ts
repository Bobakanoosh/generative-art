import { describe, expect, it } from 'vitest';
import { maxDuration as captureMaxDuration } from './c/[id]/route';
import { maxDuration } from './route';

describe('render route duration', () => {
  it('both render routes allow 300 s (Vercel fluid-compute limit): long live moments replay every step', () => {
    expect(maxDuration).toBe(300);
    expect(captureMaxDuration).toBe(300);
  });
});
