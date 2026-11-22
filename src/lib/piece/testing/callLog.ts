/**
 * Test helper: a fake 2D context that records every method call (name and
 * arguments) and swallows property sets, so piece tests can count and inspect
 * draw calls without a real canvas.
 */
export interface Call {
  name: string;
  args: unknown[];
}

export function callLog(): { ctx: CanvasRenderingContext2D; calls: Call[]; count(name: string): number } {
  const calls: Call[] = [];
  const values: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in values) return values[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return undefined;
      };
    },
    set(_t, prop, value) {
      if (typeof prop === 'string') values[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, count: (name) => calls.filter((c) => c.name === name).length };
}
