/**
 * The viewer's preferred playback speed, remembered across visits. Storage can
 * be missing or throw (private mode, blocked site data), so every access is
 * guarded and a failure just means the default.
 */
import { SPEEDS, type Speed } from './pacing';

export const SPEED_STORAGE_KEY = 'generative-art:playback-speed';

/** The stored speed if valid; else `'instant'` under reduced motion, otherwise `1`. */
export function loadSpeed(storage: Storage | undefined, prefersReducedMotion: boolean): Speed {
  const fallback: Speed = prefersReducedMotion ? 'instant' : 1;
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SPEED_STORAGE_KEY) ?? null;
  } catch {
    return fallback;
  }
  return SPEEDS.find((s) => String(s) === raw) ?? fallback;
}

export function saveSpeed(storage: Storage | undefined, speed: Speed): void {
  try {
    storage?.setItem(SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Not remembered; the choice still applies to this page.
  }
}

/** `window.localStorage`, or undefined where reading it throws or there is no window. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
