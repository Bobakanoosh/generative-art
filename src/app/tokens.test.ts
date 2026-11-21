import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(v);
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], +rgba[4]];
  throw new Error(`unparsed colour ${value}`);
}

/** Composite `fg` (possibly translucent) over opaque `bg`. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
  const base = parseColor(bg);
  const l1 = luminance(over(parseColor(fg), base));
  const l2 = luminance(base);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const css = readFileSync(path.join(__dirname, 'globals.css'), 'utf8');
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
}

describe('design token contrast over --bg', () => {
  const bg = token('bg');

  it('--fg is at least 4.5:1', () => {
    expect(contrast(token('fg'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('--muted (body copy) is at least 4.5:1', () => {
    expect(contrast(token('muted'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('--faint (secondary metadata) is at least 3:1', () => {
    expect(contrast(token('faint'), bg)).toBeGreaterThanOrEqual(3);
  });

  it('the helper rejects the old 0.34 faint value', () => {
    expect(contrast('rgba(237, 233, 226, 0.34)', '#0d0c0b')).toBeLessThan(3);
  });
});

describe('theme colours', () => {
  it('exposes only the design tokens (no legacy foreground/background aliases)', () => {
    expect(css).not.toMatch(/--color-foreground|--color-background/);
    for (const name of ['bg', 'surface', 'line', 'line-strong', 'fg', 'muted', 'faint', 'focus']) {
      expect(css).toContain(`--color-${name}: var(--${name});`);
    }
  });
});
