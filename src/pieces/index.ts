// Import each piece version here and add it to PIECES.
// App code must import registry functions from '@/pieces' so registration always runs.
import { allVersions, registerPieces, registerSlugAliases } from '@/lib/piece/registry';
import type { PieceDefinition } from '@/lib/piece/types';
import bezierDriftV1 from './bezier-drift/v1';
import crystalsV1 from './crystals/v1';
import flowRibbonsV1 from './flow-ribbons/v1';
import murmurationV1 from './murmuration/v1';
import murmurationV2 from './murmuration/v2';
import coloniesV1 from './colonies/v1';
import coloniesV2 from './colonies/v2';
import tangentFieldV1 from './tangent-field/v1';
import treeV1 from './tree/v1';

const PIECES: PieceDefinition[] = [flowRibbonsV1, murmurationV1, murmurationV2, coloniesV1, coloniesV2, crystalsV1, treeV1, tangentFieldV1, bezierDriftV1];

// Skip anything already registered so a re-evaluated module (HMR, duplicate
// bundles sharing the registry) never trips the duplicate-registration guard.
const registered = new Set(allVersions().map((d) => `${d.slug}@${d.version}`));
registerPieces(PIECES.filter((d) => !registered.has(`${d.slug}@${d.version}`)));

/** Renamed pieces: old slug -> current slug (old links redirect, old render URLs still work). */
export const SLUG_ALIASES: Record<string, string> = { 'paint-splatter': 'colonies' };
registerSlugAliases(SLUG_ALIASES);

export { getPiece, latestVersion, listPieces, allVersions, renamedSlug } from '@/lib/piece/registry';
