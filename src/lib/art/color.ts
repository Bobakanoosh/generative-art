/**
 * Color helpers. OKLCH conversion uses the deterministic math toolkit
 * (sin/cos/pow from ./math), so output strings are identical on every engine.
 */
import { PI, clamp, cos, pow, sin } from './math';

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parse `#rgb` or `#rrggbb` (leading # optional). Throws on invalid input. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbaString(r: number, g: number, b: number, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbaString(r, g, b, clamp(alpha, 0, 1));
}

/** Linear-light channel -> gamma-encoded 0..255 integer (clipped to gamut). */
function encode(linear: number): number {
  const c = clamp(linear, 0, 1);
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - 0.055;
  return clamp(Math.round(v * 255), 0, 255);
}

/**
 * OKLCH -> `rgba(r, g, b, a)`. l in [0, 1], c >= 0 (chroma), h in degrees.
 * Out-of-gamut colors are clipped per channel.
 */
export function oklch(l: number, c: number, h: number, alpha = 1): string {
  const hr = (h * PI) / 180;
  const a = c * cos(hr);
  const b = c * sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  return rgbaString(encode(r), encode(g), encode(bl), clamp(alpha, 0, 1));
}

function toHex2(v: number): string {
  const s = clamp(Math.round(v), 0, 255).toString(16);
  return s.length === 1 ? '0' + s : s;
}

/** Linear blend of two hex colors in sRGB space; returns `#rrggbb`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return (
    '#' +
    toHex2(ca[0] + (cb[0] - ca[0]) * t) +
    toHex2(ca[1] + (cb[1] - ca[1]) * t) +
    toHex2(ca[2] + (cb[2] - ca[2]) * t)
  );
}
