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

const MAX_QUERY_CHARS = 120;
const SEARCH_QUERY_KEYS = new Set(["q"]);

function candidatesSearchJson(
  status: number,
  body: Record<string, unknown>
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0, private",
      Pragma: "no-cache",
    },
  });
}
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const entries = Array.from(searchParams.entries());

    if (
      entries.some(([key]) => !SEARCH_QUERY_KEYS.has(key)) ||
      searchParams.getAll("q").length > 1
    ) {
      return candidatesSearchJson(400, { error: "request_invalid" });
    }

    const rawQuery = (searchParams.get("q") ?? "").trim();
    if (rawQuery.length > MAX_QUERY_CHARS) {
      return candidatesSearchJson(400, { error: "request_invalid" });
    }

    const q = rawQuery.toLowerCase();
    if (q.length < 2) {
      return candidatesSearchJson(200, { items: [] });
    }

    const ids = readCandidateIdsFromPersonaFolder();

    const enrichIndex = new Map<
      string,
      { full_name: string; party_name: string; role: CandidateRole }
    >();
    for (const candidate of MOCK_CANDIDATES) {
      enrichIndex.set(candidate.id, candidate);
    }

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

    const items = all
      .filter((candidate) => {
        const name = candidate.full_name.toLowerCase();
        const party = (candidate.party_name ?? "").toLowerCase();
        return name.includes(q) || party.includes(q);
      })
      .slice(0, 30);

    return candidatesSearchJson(200, { items });
  } catch {
    console.error("[candidates-search] request failed");
    return candidatesSearchJson(503, { error: "candidates_search_unavailable" });
  }
}
