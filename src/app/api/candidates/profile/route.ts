// src/app/api/candidates/profile/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { MOCK_CANDIDATES, CandidateRole } from "@/lib/votoclaro/mockCandidates";

const MAX_ID_CHARS = 96;
const MAX_IDS = 20;
const MAX_IDS_RAW_CHARS = MAX_IDS * MAX_ID_CHARS + (MAX_IDS - 1);
const SAFE_ID_RE = /^[\p{L}\p{N}_-]+$/u;
const PROFILE_QUERY_KEYS = new Set(["id", "ids"]);

type Profile = {
  id: string;
  full_name: string;
  party_name: string | null;
  role: CandidateRole | null;
  photo_url: string | null;
  hv_summary: string;
};

function profileJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0, private",
      Pragma: "no-cache",
    },
  });
}

function isSafeCandidateId(value: string) {
  return (
    value.length >= 1 &&
    value.length <= MAX_ID_CHARS &&
    SAFE_ID_RE.test(value)
  );
}

function humanizeFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function pickLocalPhotoUrl(candidateId: string) {
  const baseDir = path.join(process.cwd(), "public", "candidates");
  const exts = ["png", "jpg", "jpeg", "webp"];

  for (const ext of exts) {
    const filename = `${candidateId}.${ext}`;
    const abs = path.join(baseDir, filename);
    if (fs.existsSync(abs)) return `/candidates/${filename}`;
  }

  return null;
}

function buildProfile(id: string): Profile {
  const candidate = MOCK_CANDIDATES.find((c) => c.id === id) ?? null;

  const full_name = candidate?.full_name ?? humanizeFromSlug(id);
  const party_name = candidate?.party_name ?? null;
  const role = candidate?.role ?? null;
  const photo_url = pickLocalPhotoUrl(id);

  const hv_summary = candidate
    ? `${full_name} figura como candidato/a${party_name ? ` por ${party_name}` : ""}.`
    : `${full_name} figura en el padrÃ³n local de candidatos.`;

  return {
    id,
    full_name,
    party_name,
    role,
    photo_url,
    hv_summary:
      hv_summary +
      " (Nota: el resumen detallado se generarÃ¡ leyendo el PDF).",
  };
}

function parseIdsParam(raw: string): string[] | null {
  if (raw.length < 1 || raw.length > MAX_IDS_RAW_CHARS) return null;

  const ids = raw.split(",").map((value) => value.trim());

  if (
    ids.length < 1 ||
    ids.length > MAX_IDS ||
    ids.some((id) => !isSafeCandidateId(id))
  ) {
    return null;
  }

  return Array.from(new Set(ids));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const entries = Array.from(searchParams.entries());

    if (
      entries.some(([key]) => !PROFILE_QUERY_KEYS.has(key)) ||
      searchParams.getAll("id").length > 1 ||
      searchParams.getAll("ids").length > 1
    ) {
      return profileJson(400, { error: "request_invalid" });
    }

    const idRaw = searchParams.get("id");
    const idsRaw = searchParams.get("ids");

    if ((idRaw === null) === (idsRaw === null)) {
      return profileJson(400, { error: "request_invalid" });
    }

    if (idsRaw !== null) {
      const ids = parseIdsParam(idsRaw.trim());

      if (!ids) {
        return profileJson(400, { error: "request_invalid" });
      }

      const profiles: Record<string, Profile> = {};
      for (const id of ids) {
        profiles[id] = buildProfile(id);
      }

      return profileJson(200, { profiles });
    }

    const id = (idRaw ?? "").trim();
    if (!isSafeCandidateId(id)) {
      return profileJson(400, { error: "request_invalid" });
    }

    return profileJson(200, { profile: buildProfile(id) });
  } catch {
    console.error("[candidates-profile] request failed");
    return profileJson(503, { error: "candidate_profile_unavailable" });
  }
}
