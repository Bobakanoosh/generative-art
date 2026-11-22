/**
 * Canonical server renderer. Every image the site serves (social previews,
 * downloads, prints) comes from here, so it is the source of truth.
 */
import { createCanvas } from '@napi-rs/canvas';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { replaySource, type InputLog } from '@/lib/input/log';
import { renderFinal } from './fastForward';

export async function renderPng(
  piece: PieceDefinition,
  gen: Generation,
  widthPx: number,
  input?: InputLog,
): Promise<Buffer> {
  const width = Math.round(widthPx);
  const height = Math.round(width / piece.aspect);
  const canvas = createCanvas(width, height);
  // @napi-rs/canvas implements the 2D context API but ships its own
  // SKRSContext2D type; it is structurally close enough for pieces.
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  renderFinal(piece, gen, ctx, width, undefined, input ? replaySource(input) : undefined);
  return canvas.encode('png');
}
