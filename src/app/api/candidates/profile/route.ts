// src/app/api/candidates/profile/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { MOCK_CANDIDATES, CandidateRole } from "@/lib/votoclaro/mockCandidates";

type Profile = {
  id: string;
  full_name: string;
  party_name: string | null;
  role: CandidateRole | null;
  photo_url: string | null;
  hv_pdf_exists: boolean;
  hv_pdf_path: string; // relativo (para UI). "" si no existe
  hv_summary: string;
};

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
    const abs = path.join(baseDir, `${candidateId}.${ext}`);
    if (fs.existsSync(abs)) return `/candidates/${candidateId}.${ext}`;
  }
  return null;
}

/**
 * ✅ Encuentra HV PDF en data/docs/persona/
 * Acepta:
 *  - <id>_hv.pdf
 *  - <id>.pdf
 */
function findHvPdf(candidateId: string): { abs: string; rel: string } | null {
  const dir = path.join(process.cwd(), "data", "docs", "persona");
  const patterns = [`${candidateId}_hv.pdf`, `${candidateId}.pdf`];

  for (const name of patterns) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) {
      return { abs, rel: `data/docs/persona/${name}` };
    }
  }
  return null;
}

function buildProfile(id: string): Profile {
  const hv = findHvPdf(id);

  // ✅ Enriquecer si está en mock (nombre real/partido/rol)
  const m = MOCK_CANDIDATES.find((c) => c.id === id) ?? null;

  const full_name = m?.full_name ?? humanizeFromSlug(id);
  const party_name = m?.party_name ?? null;
  const role = m?.role ?? null;

  // ✅ Foto local por id (si existe)
  const photo_url = pickLocalPhotoUrl(id);

  // ✅ Resumen mínimo (sin inventar)
  const hv_summary = m
    ? `${full_name} figura como candidato/a${party_name ? ` por ${party_name}` : ""}.`
    : `${full_name} figura en el padrón local de candidatos.`;

  return {
    id,
    full_name,
    party_name,
    role,
    photo_url,
    hv_pdf_exists: Boolean(hv),
    hv_pdf_path: hv?.rel ?? "",
    hv_summary: hv_summary + " (Nota: el resumen detallado se generará leyendo el PDF).",
  };
}

function parseIdsParam(raw: string) {
  return raw
    .split(",")
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 20); // límite defensivo
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // ✅ Nuevo: ids (multi)
  const idsRaw = (searchParams.get("ids") ?? "").trim();
  if (idsRaw) {
    const ids = parseIdsParam(idsRaw);

    if (!ids.length) {
      return NextResponse.json({ profiles: {} }, { status: 400 });
    }

    const profiles: Record<string, Profile | null> = {};
    for (const id of ids) {
      // si viene un id inválido, devolvemos null (no rompemos UI)
      if (!id) {
        profiles[id] = null;
        continue;
      }
      profiles[id] = buildProfile(id);
    }

    return NextResponse.json({ profiles }, { headers: { "Cache-Control": "no-store" } });
  }

  // ✅ Modo clásico: id (uno)
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ profile: null }, { status: 400 });
  }

  // ✅ Antes: si no había HV devolvía 404 y rompía pantallas.
  // Ahora: devolvemos ficha igual, marcando hv_pdf_exists=false.
  const profile = buildProfile(id);

  return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
}
