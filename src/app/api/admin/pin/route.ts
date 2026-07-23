// src/app/api/admin/pin/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";
import {
  isValidPinFormat,
  revokeCandidatePanelSessionsForCandidate,
} from "@/lib/candidatePanelAuth";
import { resolveCandidatePanelIdentity } from "@/lib/candidatePanelCatalog";
import {
  isAllowedCandidatePanelMutationOrigin,
  isJsonContentType,
} from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";

type Body = {
  candidateId?: unknown;
  pin?: unknown;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return jsonError("No autorizado.", 403);
  }

  if (!isJsonContentType(req)) {
    return jsonError("Solicitud invalida.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return jsonError("No disponible.", 500);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Solicitud invalida.");
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "candidateId" && key !== "pin")
  ) {
    return jsonError("Solicitud invalida.");
  }

  const candidateId = String(body.candidateId || "").trim();
  const pin = String(body.pin || "").trim();
  const candidate = resolveCandidatePanelIdentity(candidateId);

  if (!candidate) return jsonError("Solicitud invalida.");
  if (!isValidPinFormat(pin)) return jsonError("Solicitud invalida.");

  const supabaseAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabaseAdmin
    .from("votoclaro_candidate_pins")
    .upsert(
      { candidate_id: candidate.storageCandidateId, pin },
      { onConflict: "candidate_id" }
    );

  if (error) {
    console.error("[VOTO CLARO] Error guardando PIN en Supabase:", error.message);
    return jsonError("No se pudo guardar el PIN.", 500);
  }

  const revoke = await revokeCandidatePanelSessionsForCandidate(
    candidate.storageCandidateId
  );
  if (!revoke.ok) {
    return jsonError("No se pudo completar el cambio de PIN.", 500);
  }

  return NextResponse.json({ ok: true, candidateId: candidate.canonicalId });
}
