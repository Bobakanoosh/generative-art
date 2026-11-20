/** Progress of drawing one tile plan of a print. */
export interface PrintProgress<T = unknown> {
  /** The tile plan this progress belongs to (compared by identity). */
  plan: readonly T[];
  done: number;
  error: string | null;
}

/**
 * Whether the print is fully drawn. `progress` must describe the current tile
 * plan: right after a paper/caption change it still holds the previous run's
 * (finished) counts until the new run resets it, and that must not read as
 * ready, even when both plans have the same number of tiles.
 */
export function printReady<T>(progress: PrintProgress<T>, plan: readonly T[]): boolean {
  return progress.plan === plan && progress.done === plan.length && !progress.error;
}

/**
 * Empty `host` of its tile canvases, first shrinking each to 0 × 0 so the
 * browser frees its (up to 2048² × 4 byte) backing store now rather than
 * whenever the detached element is garbage-collected.
 */
export function releaseTileCanvases(host: ParentNode): void {
  for (const canvas of host.querySelectorAll('canvas')) {
    canvas.width = 0;
    canvas.height = 0;
  }
  host.replaceChildren();
}
