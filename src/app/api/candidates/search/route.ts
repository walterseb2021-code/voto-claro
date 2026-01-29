import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { MOCK_CANDIDATES, CandidateRole } from "@/lib/votoclaro/mockCandidates";

type Candidate = {
  id: string;
  full_name: string;
  party_name: string | null;
  photo_url: string | null;
  role: CandidateRole | null;
};

function humanizeFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function resolveLocalPhotoUrl(candidateId: string) {
  const dir = path.join(process.cwd(), "public", "candidates");
  const exts = ["png", "jpg", "jpeg", "webp"];

  for (const ext of exts) {
    const filename = `${candidateId}.${ext}`;
    const abs = path.join(dir, filename);
    if (fs.existsSync(abs)) return `/candidates/${filename}`;
  }
  return null;
}

/**
 * ✅ Lee candidate_id desde data/docs/persona/
 * Acepta:
 *  - <id>_hv.pdf
 *  - <id>.pdf
 */
function readCandidateIdsFromPersonaFolder(): string[] {
  const personaDir = path.join(process.cwd(), "data", "docs", "persona");
  if (!fs.existsSync(personaDir)) return [];

  const files = fs.readdirSync(personaDir);
  const ids: string[] = [];

  for (const f of files) {
    const lower = f.toLowerCase();
    if (!lower.endsWith(".pdf")) continue;

    // Preferimos el patrón _hv.pdf si existe
    if (lower.endsWith("_hv.pdf")) {
      const id = f.replace(/_hv\.pdf$/i, "").trim();
      if (id) ids.push(id);
      continue;
    }

    // Si viene como <id>.pdf, también lo aceptamos
    const id = f.replace(/\.pdf$/i, "").trim();
    if (id) ids.push(id);
  }

  // Quitar duplicados (por si existe <id>.pdf y <id>_hv.pdf)
  const unique = Array.from(new Set(ids));
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  if (q.length < 2) return NextResponse.json({ items: [] });

  // ✅ 1) Base: ids desde filesystem
  const ids = readCandidateIdsFromPersonaFolder();

  // ✅ 2) Índice de enriquecimiento (nombre real/partido/rol SOLO si lo tienes validado)
  const enrichIndex = new Map<string, { full_name: string; party_name: string; role: CandidateRole }>();
  for (const c of MOCK_CANDIDATES) enrichIndex.set(c.id, c);

  // ✅ 3) Lista completa
  const all: Candidate[] = ids.map((id) => {
    const enriched = enrichIndex.get(id);

    return {
      id,
      full_name: enriched?.full_name ?? humanizeFromSlug(id),
      party_name: enriched?.party_name ?? null,
      role: enriched?.role ?? null,
      photo_url: resolveLocalPhotoUrl(id),
    };
  });

  // ✅ 4) Filtro por nombre o partido
  const items = all
    .filter((c) => {
      const name = c.full_name.toLowerCase();
      const party = (c.party_name ?? "").toLowerCase();
      return name.includes(q) || party.includes(q);
    })
    .slice(0, 30);

  return NextResponse.json({ items });
}
