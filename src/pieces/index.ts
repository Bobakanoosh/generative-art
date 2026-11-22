// Import each piece version here and add it to PIECES.
// App code must import registry functions from '@/pieces' so registration always runs.
import { allVersions, registerPieces } from '@/lib/piece/registry';
import type { PieceDefinition } from '@/lib/piece/types';
import bezierDriftV1 from './bezier-drift/v1';
import crystalsV1 from './crystals/v1';
import flowRibbonsV1 from './flow-ribbons/v1';
import murmurationV1 from './murmuration/v1';
import paintSplatterV1 from './paint-splatter/v1';
import tangentFieldV1 from './tangent-field/v1';
import treeV1 from './tree/v1';

const PIECES = [flowRibbonsV1, murmurationV1, paintSplatterV1, crystalsV1, treeV1, tangentFieldV1, bezierDriftV1] as PieceDefinition[];

// Skip anything already registered so a re-evaluated module (HMR, duplicate
// bundles sharing the registry) never trips the duplicate-registration guard.
const registered = new Set(allVersions().map((d) => `${d.slug}@${d.version}`));
registerPieces(PIECES.filter((d) => !registered.has(`${d.slug}@${d.version}`)));

export { getPiece, latestVersion, listPieces, allVersions } from '@/lib/piece/registry';
