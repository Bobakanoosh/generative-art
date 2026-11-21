import { replaySource, type InputLog } from '@/lib/input/log';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { renderGeneration } from '@/lib/render/runner';
import { flattenOnPaper, type PrintTile } from './tiles';

/**
 * Render one print tile (canvas sized to `tile.px`), replaying `input` when
 * given (a fresh replay source per tile: sources are stateful), then flatten
 * it onto paper white.
 */
export function renderPrintTile(
  piece: PieceDefinition,
  gen: Generation,
  ctx: CanvasRenderingContext2D,
  tile: PrintTile,
  input?: InputLog,
): void {
  renderGeneration(piece, gen, ctx, tile.px.w, tile.logical, input ? replaySource(input) : undefined);
  flattenOnPaper(ctx);
}
