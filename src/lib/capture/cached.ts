import { cacheLife } from 'next/cache';
import { loadCapture } from './store';
import type { CaptureRecord } from './record';

/**
 * `loadCapture` behind `'use cache'` for the /c/<id> pages and their metadata.
 * Captures are content-addressed and immutable, so a found record is cached for
 * the longest lifetime ('max'). A miss is cached only briefly ('minutes'), so an
 * id looked up before it was saved does not stay "not found" for a month.
 * A storage error is thrown by `loadCapture`, so it is never cached as a miss.
 * Tests use the uncached `loadCapture` directly (this needs the Next runtime).
 */
export async function getCachedCapture(id: string): Promise<CaptureRecord | null> {
  'use cache';
  const capture = await loadCapture(id);
  if (capture) cacheLife('max');
  else cacheLife('minutes');
  return capture;
}
