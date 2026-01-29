// src/lib/votoclaro/catalog.ts
export type CandidateRole = "PRESIDENTE" | "VICE1" | "VICE2";

export type Candidate = {
  id: string;          // slug (coincide con PDF hv y con imagen)
  full_name: string;
  party_id: string;    // slug del partido (coincide con data/docs/partido/<party_id>_plan.pdf)
  party_name: string;
  role: CandidateRole;
};

export type Party = {
  id: string;          // slug
  name: string;
};

export const PARTIES: Party[] = [
  // TODO: completa con tu lista real (ya la tienes definida)
  // { id: "renovacion-popular", name: "Renovación Popular" },
];

export const CANDIDATES: Candidate[] = [
  // TODO: completa con tus ≈34 (Presidente/Vice1/Vice2)
  // Ejemplos:
  // {
  //   id: "jose-leon-luna-galvez",
  //   full_name: "José León Luna Gálvez",
  //   party_id: "partido-x",
  //   party_name: "Partido X",
  //   role: "PRESIDENTE",
  // },
  // {
  //   id: "keiko-sofia-fujimori-higuchi",
  //   full_name: "Keiko Sofía Fujimori Higuchi",
  //   party_id: "fuerza-popular",
  //   party_name: "Fuerza Popular",
  //   role: "PRESIDENTE",
  // },
];

export function getCandidateById(id: string): Candidate | undefined {
  return CANDIDATES.find((c) => c.id === id);
}

export function getCandidatesByParty(party_id: string): Candidate[] {
  return CANDIDATES.filter((c) => c.party_id === party_id);
}

export function getPartyById(id: string): Party | undefined {
  return PARTIES.find((p) => p.id === id);
}

// Rutas canónicas a PDFs (según tu estructura confirmada)
export function hvPdfPath(candidate_id: string) {
  return `data/docs/persona/${candidate_id}_hv.pdf`;
}

export function planPdfPathByParty(party_id: string) {
  return `data/docs/partido/${party_id}_plan.pdf`;
}
