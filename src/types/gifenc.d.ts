/** Minimal types for gifenc 1.0.3 (ships without declarations). */
declare module 'gifenc' {
  export type GifPalette = number[][];
  export type GifColorFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: GifColorFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean },
  ): GifPalette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: GifColorFormat,
  ): Uint8Array;

  export interface GifFrameOptions {
    palette?: GifPalette;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    /** Milliseconds. */
    delay?: number;
    /** 0 = loop forever, -1 = play once. */
    repeat?: number;
    dispose?: number;
  }

  export interface GifEncoderStream {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifEncoderStream;
}
