/** Maps a thrown render error to an HTTP status + JSON body. Pure. */
export function mapRenderError(err: unknown): { status: 400 | 500; error: string } {
  if (err instanceof Error && err.message.includes('Endless piece requires a stop step')) {
    return { status: 400, error: 'Endless piece requires n' };
  }
  return { status: 500, error: 'Render failed' };
}
