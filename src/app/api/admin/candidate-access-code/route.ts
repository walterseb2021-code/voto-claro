import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  generateCandidateAccessCode,
  getCandidatePanelAdminClient,
  hashCandidateAccessCode,
} from "@/lib/candidatePanelAuth";
import { resolveCandidatePanelIdentity } from "@/lib/candidatePanelCatalog";
import {
  isAllowedCandidatePanelMutationOrigin,
  isJsonContentType,
} from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  candidateId?: unknown;
};

type CredentialRow = {
  credential_revision: number | string | null;
};

const BODY_KEYS = new Set(["candidateId"]);

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function jsonError(message: string, status = 400) {
  return jsonResponse({ ok: false, error: message }, status);
}

function currentRevision(row: CredentialRow | null) {
  if (!row) return 0;
  const value = Number(row.credential_revision ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return jsonResponse({ error: gate.error }, gate.status);
  }

  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return jsonError("No autorizado.", 403);
  }

  if (!isJsonContentType(req)) {
    return jsonError("Solicitud invalida.");
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
    Object.keys(body).some((key) => !BODY_KEYS.has(key))
  ) {
    return jsonError("Solicitud invalida.");
  }

  const candidate = resolveCandidatePanelIdentity(body.candidateId);
  if (!candidate) return jsonError("Solicitud invalida.");

  const supabase = getCandidatePanelAdminClient();
  const { data: credentialRow, error: revisionError } = await supabase
    .from("votoclaro_candidate_pins")
    .select("credential_revision")
    .eq("candidate_id", candidate.storageCandidateId)
    .maybeSingle<CredentialRow>();

  if (revisionError) {
    console.error("[candidate-access-code] revision lookup failed", revisionError.message);
    return jsonError("No disponible.", 503);
  }

  const expectedRevision = currentRevision(credentialRow ?? null);
  if (expectedRevision === null) {
    console.error("[candidate-access-code] invalid stored credential revision");
    return jsonError("No disponible.", 503);
  }

  const accessCode = generateCandidateAccessCode();
  let verifier: string;
  try {
    verifier = await hashCandidateAccessCode(accessCode);
  } catch {
    console.error("[candidate-access-code] credential preparation failed");
    return jsonError("No disponible.", 503);
  }

  const { error: rotateError } = await supabase.rpc("rotate_candidate_access_code", {
    p_candidate_id: candidate.storageCandidateId,
    p_expected_revision: expectedRevision,
    p_access_code_verifier: verifier,
  });

  if (rotateError) {
    if (
      rotateError.code === "P0001" &&
      rotateError.message.includes("CANDIDATE_ACCESS_CODE_REVISION_CONFLICT")
    ) {
      return jsonError("Conflicto de rotacion. Intenta nuevamente.", 409);
    }

    console.error("[candidate-access-code] rotation failed", rotateError.message);
    return jsonError("No disponible.", 503);
  }

  return jsonResponse({
    ok: true,
    candidateId: candidate.canonicalId,
    accessCode,
  });
}
