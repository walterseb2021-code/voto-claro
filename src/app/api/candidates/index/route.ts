// src/app/api/candidates/index/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const INDEX_QUERY_KEYS = new Set(["onlyWithPlan"]);

function candidatesIndexJson(
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

type CandidateLite = {
  id: string;
  full_name: string;
  party_name: string;
};

function titleCaseFromId(id: string) {
  // "keiko-sofia-fujimori-higuchi" => "Keiko Sofia Fujimori Higuchi"
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function safeReadJson<T>(absPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * ✅ Determina partyId desde party_name (para construir el filename del plan)
 * - minúsculas
 * - sin tildes
 * - espacios/guiones/puntuación -> "-"
 */
function partyIdFromName(partyName: string) {
  const s = String(partyName || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/-+/g, "-");
  return s;
}

/**
 * ✅ Check rápido local: ¿existe data/docs/partido/<partyId>_plan.pdf?
 */
async function hasPlanPdfForCandidate(c: CandidateLite) {
  const baseDir = path.join(process.cwd(), "data", "docs", "partido");

  // ✅ Opción A: por party_name => <partyId>_plan.pdf
  const partyId = partyIdFromName(c.party_name);
  if (partyId) {
    const byParty = path.join(baseDir, `${partyId}_plan.pdf`);
    try {
      await fs.access(byParty);
      return true;
    } catch {}
  }

  // ✅ Opción B: por id del candidato => <candidateId>_plan.pdf
  // (esto salva casos donde el plan fue guardado con el id del candidato)
  const cid = String(c.id || "").trim();
  if (cid) {
    const byCandidateId = path.join(baseDir, `${cid}_plan.pdf`);
    try {
      await fs.access(byCandidateId);
      return true;
    } catch {}
  }

  return false;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const entries = Array.from(searchParams.entries());

    if (
      entries.some(([key]) => !INDEX_QUERY_KEYS.has(key)) ||
      searchParams.getAll("onlyWithPlan").length > 1
    ) {
      return candidatesIndexJson(400, { error: "request_invalid" });
    }

    const onlyWithPlanRaw = searchParams.get("onlyWithPlan");
    if (
      onlyWithPlanRaw !== null &&
      onlyWithPlanRaw !== "0" &&
      onlyWithPlanRaw !== "1"
    ) {
      return candidatesIndexJson(400, { error: "request_invalid" });
    }

    const onlyWithPlan = onlyWithPlanRaw === "1";

    // 1) IDs desde PDFs locales (opcional)
    const personaDir = path.join(process.cwd(), "data", "docs", "persona");
    let idsFromPdf: string[] = [];

    try {
      const files = await fs.readdir(personaDir);
      idsFromPdf = files
        .filter((f) => f.toLowerCase().endsWith("_hv.pdf"))
        .map((f) => f.replace(/_hv\.pdf$/i, ""));
    } catch {
      idsFromPdf = [];
    }

    // 2) JSON local (principal si existe)
    // Formato esperado:
    // { "candidates": [{ "id":"...", "full_name":"...", "party_name":"..." }, ...] }
    const candidatesJsonPath = path.join(process.cwd(), "data", "candidates.json");
    const json = await safeReadJson<{ candidates?: CandidateLite[] }>(candidatesJsonPath);

    const jsonCandidates = Array.isArray(json?.candidates) ? json!.candidates! : [];

    // Mapa por id desde JSON (para “enriquecer”)
    const jsonMap = new Map<string, CandidateLite>();
    for (const c of jsonCandidates) {
      const id = (c?.id ?? "").trim();
      if (!id) continue;
      jsonMap.set(id, {
        id,
        full_name: String(c?.full_name ?? "").trim(),
        party_name: String(c?.party_name ?? "").trim(),
      });
    }

    // 3) Unimos IDs: PDFs + JSON
    const uniqIds = new Set<string>();
    for (const id of idsFromPdf) uniqIds.add(id);
    for (const id of jsonMap.keys()) uniqIds.add(id);

    // 4) Construimos salida
    let candidates: CandidateLite[] = Array.from(uniqIds).map((id) => {
      const fromJson = jsonMap.get(id);
      const full = fromJson?.full_name?.trim() || titleCaseFromId(id);
      const party = fromJson?.party_name?.trim() || "";
      return { id, full_name: full, party_name: party };
    });

    // ✅ 5) OCULTAR SIN PLAN (solo si ?onlyWithPlan=1)
    let filteredOutNoPlan = 0;

    if (onlyWithPlan) {
      const checks = await Promise.all(
        candidates.map(async (c) => ({ c, ok: await hasPlanPdfForCandidate(c) }))
      );
      const kept = checks.filter((x) => x.ok).map((x) => x.c);
      filteredOutNoPlan = candidates.length - kept.length;
      candidates = kept;
    }

    // Orden estable para el UI
    candidates.sort((a, b) => a.full_name.localeCompare(b.full_name, "es", { sensitivity: "base" }));

    return candidatesIndexJson(200, {
      candidates,
      count: candidates.length,
    });
  } catch {
    console.error("[candidates-index] request failed");
    return candidatesIndexJson(503, { error: "candidates_index_unavailable" });
  }
}
