import { CANDIDATE_GROUPS } from "@/lib/perufederalCandidates";

export type CandidatePanelSource = "current" | "legacy";

export type CandidatePanelIdentity = {
  canonicalId: string;
  storageCandidateId: string;
  displayName: string;
  acceptedIds: string[];
  cargo?: string;
  region?: string;
  source: CandidatePanelSource;
};

const LEGACY_IDENTITIES: CandidatePanelIdentity[] = [
  {
    canonicalId: "armando-joaquin-masse-fernandez",
    storageCandidateId: "armando-joaquin-massc-fernandez",
    displayName: "Armando Joaquín Massé Fernández",
    acceptedIds: [
      "armando-joaquin-masse-fernandez",
      "armando-joaquin-massc-fernandez",
    ],
    cargo: "Presidente",
    region: "PERÚ",
    source: "legacy",
  },
  {
    canonicalId: "cesar-acuña-peralta",
    storageCandidateId: "cesar-acuña-peralta",
    displayName: "César Acuña Peralta",
    acceptedIds: ["cesar-acuña-peralta"],
    cargo: "Presidente",
    region: "PERÚ",
    source: "current",
  },
  {
    canonicalId: "elizabeth-alfaro-espinoza",
    storageCandidateId: "elizabeth-alfaro-espinoza",
    displayName: "Elizabeth Alfaro Espinoza",
    acceptedIds: ["elizabeth-alfaro-espinoza"],
    cargo: "Senador",
    region: "PERÚ",
    source: "legacy",
  },
  {
    canonicalId: "luis-bernardo-guerrero-figueroa",
    storageCandidateId: "luis-bernardo-guerrero-figueroa",
    displayName: "Luis Bernardo Guerrero Figueroa",
    acceptedIds: ["luis-bernardo-guerrero-figueroa"],
    cargo: "Senador",
    region: "PERÚ",
    source: "legacy",
  },
  {
    canonicalId: "virgilio-acuña-peralta",
    storageCandidateId: "virgilio-acuña-peralta",
    displayName: "Virgilio Acuña Peralta",
    acceptedIds: ["virgilio-acuña-peralta"],
    cargo: "Senador",
    region: "PERÚ",
    source: "legacy",
  },
  {
    canonicalId: "zulema-rebeca-azucena-barrenechea-reyes",
    storageCandidateId: "zulema-rebecca-azucena-barrenechea-reyes",
    displayName: "Zulema Rebeca Azucena Barrenechea Reyes",
    acceptedIds: [
      "zulema-rebeca-azucena-barrenechea-reyes",
      "zulema-rebecca-azucena-barrenechea-reyes",
    ],
    cargo: "Diputado",
    region: "ÁNCASH",
    source: "legacy",
  },
];

let optionsCache: CandidatePanelIdentity[] | null = null;
let lookupCache: Map<string, CandidatePanelIdentity> | null = null;

function normalizeCandidatePanelId(candidateId: unknown) {
  let value = String(candidateId ?? "").trim();
  if (!value || value.length > 160 || /[\u0000-\u001f]/.test(value)) return "";

  try {
    value = decodeURIComponent(value).trim();
  } catch {}

  if (!value || value.length > 160 || /[\u0000-\u001f]/.test(value)) return "";
  return value;
}

function uniqueIds(ids: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    const clean = normalizeCandidatePanelId(id);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }

  return result;
}

function buildOptions() {
  const byCanonicalId = new Map<string, CandidatePanelIdentity>();

  for (const group of CANDIDATE_GROUPS) {
    for (const candidate of group.candidates) {
      const id = normalizeCandidatePanelId(candidate.id);
      if (!id || byCanonicalId.has(id)) continue;

      byCanonicalId.set(id, {
        canonicalId: id,
        storageCandidateId: id,
        displayName: String(candidate.name).trim(),
        acceptedIds: [id],
        cargo: String(candidate.cargo ?? "").trim() || undefined,
        region: String(candidate.region ?? "").trim() || undefined,
        source: "current",
      });
    }
  }

  for (const legacy of LEGACY_IDENTITIES) {
    const current = byCanonicalId.get(legacy.canonicalId);
    byCanonicalId.set(legacy.canonicalId, {
      ...legacy,
      acceptedIds: uniqueIds([
        ...legacy.acceptedIds,
        ...(current?.acceptedIds ?? []),
      ]),
      cargo: current?.cargo ?? legacy.cargo,
      region: current?.region ?? legacy.region,
    });
  }

  return Array.from(byCanonicalId.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" })
  );
}

function getLookup() {
  if (lookupCache) return lookupCache;

  const lookup = new Map<string, CandidatePanelIdentity>();
  for (const identity of getCandidatePanelOptions()) {
    for (const acceptedId of identity.acceptedIds) {
      lookup.set(acceptedId, identity);
    }
  }

  lookupCache = lookup;
  return lookup;
}

export function getCandidatePanelOptions() {
  if (!optionsCache) optionsCache = buildOptions();
  return optionsCache;
}

export function resolveCandidatePanelIdentity(candidateId: unknown) {
  const id = normalizeCandidatePanelId(candidateId);
  if (!id) return null;
  return getLookup().get(id) ?? null;
}
