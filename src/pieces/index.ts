// Import each piece version here and add it to PIECES.
// App code must import registry functions from '@/pieces' so registration always runs.
import { allVersions, registerPieces } from '@/lib/piece/registry';
import type { PieceDefinition } from '@/lib/piece/types';
import flowRibbonsV1 from './flow-ribbons/v1';
import murmurationV1 from './murmuration/v1';

const PIECES = [flowRibbonsV1, murmurationV1] as PieceDefinition[];

// Skip anything already registered so a re-evaluated module (HMR, duplicate
// bundles sharing the registry) never trips the duplicate-registration guard.
const registered = new Set(allVersions().map((d) => `${d.slug}@${d.version}`));
registerPieces(PIECES.filter((d) => !registered.has(`${d.slug}@${d.version}`)));

export { getPiece, latestVersion, listPieces, allVersions } from '@/lib/piece/registry';
