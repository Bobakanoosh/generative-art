import type { PieceDefinition } from './types';

// slug -> version -> definition
const pieces = new Map<string, Map<number, PieceDefinition>>();
// renamed piece: old slug -> current slug
const aliases = new Map<string, string>();

/** Register renamed pieces (old slug -> current slug). Old links keep resolving. */
export function registerSlugAliases(map: Record<string, string>): void {
  for (const [from, to] of Object.entries(map)) {
    if (pieces.has(from)) throw new Error(`Slug alias shadows a registered piece: ${from}`);
    aliases.set(from, to);
  }
}

/** The current slug for `slug` if it is an old (renamed) one, else undefined. */
export function renamedSlug(slug: string): string | undefined {
  return aliases.get(slug);
}

const canonical = (slug: string) => aliases.get(slug) ?? slug;

export function registerPieces(defs: PieceDefinition[]): void {
  for (const def of defs) {
    let versions = pieces.get(def.slug);
    if (!versions) {
      versions = new Map();
      pieces.set(def.slug, versions);
    }
    if (versions.has(def.version)) {
      throw new Error(`Piece already registered: ${def.slug} v${def.version}`);
    }
    versions.set(def.version, def);
  }
}

const isProd = () => process.env.NODE_ENV === 'production';

/** Versions visible to app code: local ones are hidden in production. */
function visibleVersions(slug: string): PieceDefinition[] {
  const versions = pieces.get(canonical(slug));
  if (!versions) return [];
  const hideLocal = isProd();
  return [...versions.values()].filter((d) => !(hideLocal && d.local));
}

export function latestVersion(slug: string): number | undefined {
  const vs = visibleVersions(slug);
  return vs.length ? Math.max(...vs.map((d) => d.version)) : undefined;
}

export function getPiece(slug: string, version?: number): PieceDefinition | undefined {
  const v = version ?? latestVersion(slug);
  if (v === undefined) return undefined;
  const def = pieces.get(canonical(slug))?.get(v);
  return def && !(isProd() && def.local) ? def : undefined;
}

export function listPieces(): PieceDefinition[] {
  const out: PieceDefinition[] = [];
  for (const slug of pieces.keys()) {
    const latest = getPiece(slug);
    if (latest) out.push(latest);
  }
  return out;
}

export function allVersions(): PieceDefinition[] {
  return [...pieces.values()].flatMap((m) => [...m.values()]);
}

/** Test-only: clears all registrations. */
export function __resetRegistryForTests(): void {
  pieces.clear();
  aliases.clear();
}
