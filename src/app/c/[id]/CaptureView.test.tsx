// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { goodCapture } from '@/lib/capture/fixtures';

// Canvas and recording internals are out of scope here (jsdom has no 2D canvas).
vi.mock('@/app/art/[slug]/ArtCanvas', () => ({ default: () => <div data-testid="art-canvas" /> }));
vi.mock('@/app/art/[slug]/VideoExport', () => ({ default: () => <button type="button">Record video</button> }));

import CaptureView from './CaptureView';

afterEach(cleanup);

describe('CaptureView PNG download width', () => {
  it.each([
    [300, '4096'],
    [20_000, '4096'],
    [40_000, '2400'],
    [100_000, '1200'],
  ])('a capture at step %i downloads at width %s', (n, width) => {
    render(<CaptureView id="abcdefghijkl" capture={{ ...goodCapture(), n }} />);
    const href = screen.getByRole('link', { name: 'Download PNG' }).getAttribute('href')!;
    expect(href).toBe(`/api/render/c/abcdefghijkl?w=${width}`);
  });
});
