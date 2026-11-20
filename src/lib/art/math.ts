/**
 * Deterministic math for generative art.
 *
 * Built-in transcendental functions (Math.sin, Math.exp, ...) are
 * implementation-approximated by the ECMAScript spec and can differ between
 * engines. Everything here is built only from IEEE-754 correctly-rounded
 * operations (+ - * /, Math.sqrt) plus floor/abs/min/max and bit-level float
 * construction, so results are bit-identical on every conforming engine.
 *
 * All constants below are exact decimal literals of specific doubles; none are
 * computed with transcendental functions.
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

// ---------------------------------------------------------------------------
// Bit-level helpers (big-endian DataView: platform-independent).

const dv = new DataView(new ArrayBuffer(8));

/** 2^k for integer k in [-1022, 1023], built from exponent bits. */
function twoPow(k: number): number {
  dv.setUint32(0, ((k + 1023) << 20) >>> 0);
  dv.setUint32(4, 0);
  return dv.getFloat64(0);
}

const TWO_1023 = twoPow(1023);
const TWO_M969 = twoPow(-969); // 2^-1022 * 2^53
const TWO_54 = 18014398509481984; // 2^54
const TWO_600 = twoPow(600);
const TWO_M600 = twoPow(-600);
const TWO_500 = twoPow(500);
const TWO_M500 = twoPow(-500);
const MIN_NORMAL = 2.2250738585072014e-308; // 2^-1022

/** y * 2^n with a single final rounding (musl scalbn). */
function scalbn(y: number, n: number): number {
  if (n > 1023) {
    y *= TWO_1023;
    n -= 1023;
    if (n > 1023) {
      y *= TWO_1023;
      n -= 1023;
      if (n > 1023) n = 1023;
    }
  } else if (n < -1022) {
    y *= TWO_M969;
    n += 969;
    if (n < -1022) {
      y *= TWO_M969;
      n += 969;
      if (n < -1022) n = -1022;
    }
  }
  return y * twoPow(n);
}

// ---------------------------------------------------------------------------
// sin / cos / tan

// Cody–Waite split of pi/2 (fdlibm e_rem_pio2.c). PIO2_1 and PIO2_2 have 33
// significant bits, so n * PIO2_x is exact for |n| < 2^20 (|x| < ~1.6e6).
const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417e0; // 0x3FF921FB_54400000
const PIO2_2 = 6.07710050630396597660e-11; // 0x3DD0B461_1A600000
const PIO2_2T = 2.02226624879595063154e-21; // pi/2 - PIO2_1 - PIO2_2
const PIO4 = 7.85398163397448278999e-1;

// Minimax kernel coefficients on [-pi/4, pi/4] (fdlibm k_sin.c / k_cos.c),
// accurate to ~2^-58 — better than the equivalent-degree Taylor series.
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kSin(y: number): number {
  const z = y * y;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return y + y * z * (S1 + z * r);
}

function kCos(y: number): number {
  const z = y * y;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + ((1 - w - hz) + z * r);
}

// Result of the last range reduction (avoids allocating a tuple per call).
let redN = 0;
let redY = 0;

// Payne–Hanek reduction for large |x|, using exact BigInt integer arithmetic
// (deterministic on every engine). 2/pi is computed once, lazily, to
// PH_BITS fractional bits from Machin's formula — no hand-typed bit table.
const PH_BITS = 1280; // >= 971 (max exponent) + 53 + ~256 bits of headroom
const PH_GUARD = 64;
// |x| below this keeps n < 2^20, where Cody–Waite above is exact.
const PH_THRESHOLD = 1.6e6;
const BIG0 = BigInt(0);
const BIG1 = BigInt(1);
const BIG3 = BigInt(3);
let twoOverPiScaled: bigint | null = null; // floor(2/pi * 2^PH_BITS)

function getTwoOverPi(): bigint {
  if (twoOverPiScaled !== null) return twoOverPiScaled;
  const scale = BIG1 << BigInt(PH_BITS + PH_GUARD);
  const atanInv = (k: number): bigint => {
    const kb = BigInt(k);
    const k2 = kb * kb;
    let term = scale / kb;
    let sum = BIG0;
    for (let n = 0; term !== BIG0; n++) {
      const t = term / BigInt(2 * n + 1);
      sum = n % 2 === 0 ? sum + t : sum - t;
      term = term / k2;
    }
    return sum;
  };
  // pi * 2^(PH_BITS+PH_GUARD), error of a few hundred units (<< 2^PH_GUARD)
  const piScaled = BigInt(16) * atanInv(5) - BigInt(4) * atanInv(239);
  twoOverPiScaled = (BIG1 << BigInt(2 * PH_BITS + PH_GUARD + 1)) / piScaled;
  return twoOverPiScaled;
}

/** Bit length of a positive bigint. */
function bitLength(v: bigint): number {
  return v.toString(2).length;
}

function reduceLarge(x: number): void {
  const neg = x < 0;
  const ax = neg ? -x : x;
  dv.setFloat64(0, ax);
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  // ax = m * 2^e exactly (ax is normal here)
  const m = (BigInt((hi & 0x000fffff) | 0x00100000) << BigInt(32)) | BigInt(lo);
  const e = ((hi >>> 20) & 0x7ff) - 1075;
  const s = PH_BITS - e; // fractional bits of the product; always > 300
  const sB = BigInt(s);
  // ax * 2/pi = prod / 2^s
  const prod = m * getTwoOverPi();
  const q = prod >> sB;
  let frac = prod - (q << sB);
  let n = Number(q & BIG3);
  let negF = false;
  if (frac >= BIG1 << BigInt(s - 1)) {
    n += 1;
    frac = (BIG1 << sB) - frac;
    negF = true;
  }
  let f = 0; // fraction of a quarter-turn, |f| <= 0.5
  if (frac !== BIG0) {
    const sh = Math.max(0, bitLength(frac) - 64);
    f = scalbn(Number(frac >> BigInt(sh)), sh - s);
  }
  let y = f * HALF_PI + f * HALF_PI_LO;
  if (negF) y = -y;
  if (neg) {
    n = -n;
    y = -y;
  }
  redN = n;
  redY = y;
}

/** x = n * pi/2 + y with |y| <= ~pi/4. x must be finite. */
function reduce(x: number): void {
  const ax = Math.abs(x);
  if (ax <= PIO4) {
    redN = 0;
    redY = x;
    return;
  }
  if (ax >= PH_THRESHOLD) {
    reduceLarge(x);
    return;
  }
  const n = Math.floor(x * INV_PIO2 + 0.5);
  redN = n;
  redY = x - n * PIO2_1 - n * PIO2_2 - n * PIO2_2T;
}

export function sin(x: number): number {
  if (x === 0) return x; // keep the sign of zero
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  reduce(x);
  switch (redN & 3) {
    case 0: return kSin(redY);
    case 1: return kCos(redY);
    case 2: return -kSin(redY);
    default: return -kCos(redY);
  }
}

export function cos(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  reduce(x);
  switch (redN & 3) {
    case 0: return kCos(redY);
    case 1: return -kSin(redY);
    case 2: return -kCos(redY);
    default: return kSin(redY);
  }
}

export function tan(x: number): number {
  if (x === 0) return x; // keep the sign of zero
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  reduce(x);
  const s = kSin(redY);
  const c = kCos(redY);
  return (redN & 1) === 0 ? s / c : -c / s;
}

// ---------------------------------------------------------------------------
// atan / atan2

const HALF_PI_LO = 6.123233995736766e-17; // pi/2 - HALF_PI
const PI_LO = 1.2246467991473532e-16; // pi - PI
const PI_6 = 0.5235987755982988; // nearest double to pi/6
const QUARTER_PI = 0.7853981633974483;
const THREE_QUARTER_PI = 2.356194490192345;
const SQRT3 = 1.7320508075688772;
const TAN_PI_12 = 0.2679491924311227; // 2 - sqrt(3)

// Taylor coefficients (-1)^k / (2k+1), k = 0..15; |t| <= 0.268 so the
// truncation error is below 0.268^33 / 33 ~ 3e-21.
const ATAN_TERMS = 16;
const ATAN_C: number[] = [];
for (let k = 0; k < ATAN_TERMS; k++) ATAN_C.push((k % 2 === 0 ? 1 : -1) / (2 * k + 1));

export function atan(x: number): number {
  if (x !== x || x === 0) return x; // NaN, ±0
  const neg = x < 0;
  let a = neg ? -x : x;
  const inverted = a > 1;
  if (inverted) a = 1 / a; // Infinity -> 0
  let offset = 0;
  if (a > TAN_PI_12) {
    a = (SQRT3 * a - 1) / (SQRT3 + a);
    offset = PI_6;
  }
  const z = a * a;
  let p = ATAN_C[ATAN_TERMS - 1];
  for (let k = ATAN_TERMS - 2; k >= 0; k--) p = ATAN_C[k] + z * p;
  let r = offset + a * p;
  if (inverted) r = HALF_PI - r + HALF_PI_LO;
  return neg ? -r : r;
}

export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (y === 0) {
    // +0 or positive x keeps the signed zero; -0 or negative x gives ±pi.
    if (x > 0 || (x === 0 && 1 / x > 0)) return y;
    return 1 / y > 0 ? PI : -PI;
  }
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;
  const xInf = x === Infinity || x === -Infinity;
  const yInf = y === Infinity || y === -Infinity;
  if (xInf) {
    if (yInf) {
      const r = x > 0 ? QUARTER_PI : THREE_QUARTER_PI;
      return y > 0 ? r : -r;
    }
    if (x > 0) return y > 0 ? 0 : -0;
    return y > 0 ? PI : -PI;
  }
  if (yInf) return y > 0 ? HALF_PI : -HALF_PI;
  const a = atan(Math.abs(y / x));
  if (x > 0) return y > 0 ? a : -a;
  const r = PI - a + PI_LO;
  return y > 0 ? r : -r;
}

// ---------------------------------------------------------------------------
// exp / log / pow

// ln2 split (fdlibm): LN2_HI has 32 trailing zero bits, so k * LN2_HI is exact.
const LN2_HI = 6.93147180369123816490e-1; // 0x3FE62E42_FEE00000
const LN2_LO = 1.90821492927058770002e-10; // 0x3DEA39EF_35793C76
const INV_LN2 = 1.44269504088896338700e0;
const EXP_OVERFLOW = 7.09782712893383973096e2;
const EXP_UNDERFLOW = -7.45133219101941108420e2;

// 1/n! for n = 0..16 (sequential exact-op division: deterministic).
// |r| <= ln2/2 ~ 0.347, so the truncation error is 0.347^17/17! < 1e-22.
const EXP_TERMS = 17;
const INV_FACT: number[] = [1];
for (let n = 1; n < EXP_TERMS; n++) INV_FACT.push(INV_FACT[n - 1] / n);

export function exp(x: number): number {
  if (x !== x) return x;
  if (x > EXP_OVERFLOW) return Infinity;
  if (x < EXP_UNDERFLOW) return 0;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const r = x - k * LN2_HI - k * LN2_LO;
  let p = INV_FACT[EXP_TERMS - 1];
  for (let n = EXP_TERMS - 2; n >= 1; n--) p = INV_FACT[n] + r * p;
  return scalbn(1 + r * p, k);
}

const SQRT2 = 1.4142135623730951;
// 1/(2k+1) for the atanh series; |s| <= (sqrt2-1)/(sqrt2+1) ~ 0.1716 so the
// truncation error is below 0.1716^27 / 27 ~ 6e-23.
const LOG_TERMS = 13;
const LOG_C: number[] = [];
for (let k = 0; k < LOG_TERMS; k++) LOG_C.push(1 / (2 * k + 1));

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  let e = 0;
  if (x < MIN_NORMAL) {
    x *= TWO_54; // normalize subnormals (exact)
    e = -54;
  }
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  dv.setUint32(0, ((hi & 0x000fffff) | 0x3ff00000) >>> 0);
  let m = dv.getFloat64(0); // [1, 2)
  if (m > SQRT2) {
    m *= 0.5;
    e += 1;
  }
  // log(m) = 2 atanh(s), s = (m - 1) / (m + 1)
  const s = (m - 1) / (m + 1);
  const z = s * s;
  let p = LOG_C[LOG_TERMS - 1];
  for (let k = LOG_TERMS - 2; k >= 1; k--) p = LOG_C[k] + z * p;
  const logm = 2 * s + 2 * s * z * p;
  return e * LN2_HI + (e * LN2_LO + logm);
}

const TWO_53 = 9007199254740992;

function powPositive(x: number, y: number): number {
  // Small integer exponents: binary exponentiation keeps exact results exact.
  if (Math.floor(y) === y && Math.abs(y) <= 64) {
    let n = Math.abs(y);
    let base = x;
    let acc = 1;
    while (n > 0) {
      if (n % 2 === 1) acc *= base;
      base *= base;
      n = Math.floor(n / 2);
    }
    if (acc !== 0 && acc !== Infinity) return y < 0 ? 1 / acc : acc;
  }
  return exp(y * log(x));
}

export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (y === 1) return x;
  const yInf = y === Infinity || y === -Infinity;
  const yInt = !yInf && Math.floor(y) === y;
  const yOdd = yInt && Math.abs(y) < TWO_53 && y % 2 !== 0;
  if (yInf) {
    const ax = Math.abs(x);
    if (ax === 1) return NaN;
    return ax > 1 === y > 0 ? Infinity : 0;
  }
  if (x === 0) {
    if (y > 0) return yOdd ? x : 0;
    return yOdd ? 1 / x : Infinity;
  }
  if (x === Infinity) return y > 0 ? Infinity : 0;
  if (x === -Infinity) {
    if (y > 0) return yOdd ? -Infinity : Infinity;
    return yOdd ? -0 : 0;
  }
  if (x < 0) {
    if (!yInt) return NaN;
    const r = powPositive(-x, y);
    return yOdd ? -r : r;
  }
  return powPositive(x, y);
}

// ---------------------------------------------------------------------------
// hypot and interpolation helpers

export function hypot(x: number, y: number): number {
  if (x === Infinity || x === -Infinity || y === Infinity || y === -Infinity) return Infinity;
  if (x !== x || y !== y) return NaN;
  let a = Math.abs(x);
  let b = Math.abs(y);
  const m = Math.max(a, b);
  if (m === 0) return 0;
  if (m > TWO_500) {
    a *= TWO_M600;
    b *= TWO_M600;
    return Math.sqrt(a * a + b * b) * TWO_600;
  }
  if (m < TWO_M500) {
    a *= TWO_600;
    b *= TWO_600;
    return Math.sqrt(a * a + b * b) * TWO_M600;
  }
  return Math.sqrt(a * a + b * b);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function map(x: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  return outLo + ((x - inLo) * (outHi - outLo)) / (inHi - inLo);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
