import { describe, expect, it } from 'vitest';
import { mapRenderError } from './renderError';

describe('mapRenderError', () => {
  it('maps endless-without-stop-step to 400', () => {
    expect(mapRenderError(new Error('Endless piece requires a stop step'))).toEqual({
      status: 400,
      error: 'Endless piece requires n',
    });
  });
  it('maps other errors to 500', () => {
    expect(mapRenderError(new Error('boom'))).toEqual({ status: 500, error: 'Render failed' });
    expect(mapRenderError('weird')).toEqual({ status: 500, error: 'Render failed' });
  });
});
