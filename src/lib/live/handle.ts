import type { InputLog } from '@/lib/input/log';
import type { Generation } from '@/lib/piece/types';
import type { LiveSim } from './live';

/** A live sim together with the generation it is running; the two always travel together. */
export interface LiveHandle {
  sim: LiveSim;
  gen: Generation;
}

/**
 * Freezes the moment of `requested` (the sim the viewer pressed Capture on),
 * paired with that sim's own generation. Null when it is no longer the
 * current sim (destroyed by a resize or a generation change), so a capture can
 * never combine one session's input with another generation's params.
 */
export function takeMoment(
  current: LiveHandle | null,
  requested: LiveHandle | null,
): { gen: Generation; moment: { n: number; input: InputLog } } | null {
  if (!current || current !== requested) return null;
  return { gen: current.gen, moment: current.sim.capture() };
}
