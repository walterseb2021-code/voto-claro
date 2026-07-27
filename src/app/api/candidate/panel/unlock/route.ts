import { NextResponse, type NextRequest } from "next/server";
import {
  applyCandidatePanelCookie,
  checkCandidatePanelRateLimit,
  createCandidatePanelSession,
  getCandidatePanelAdminClient,
  getIpFingerprint,
  isActiveCredentialStatus,
  isValidCandidateAccessCode,
  normalizeCandidateAccessCode,
  recordCandidatePanelPinFailure,
  resetCandidatePanelRateLimit,
  resolveCandidate,
  revokeCandidatePanelSession,
  verifyCandidateAccessCode,
} from "@/lib/candidatePanelAuth";
import {
  isAllowedCandidatePanelMutationOrigin,
  isJsonContentType,
} from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";

type UnlockBody = {
  candidateId?: unknown;
  accessCode?: unknown;
};

const UNLOCK_KEYS = new Set(["candidateId", "accessCode"]);
const FORBIDDEN_LEGACY_KEYS = new Set([
  "pin",
  "candidatePin",
  "legacyPin",
  "code",
  "password",
]);

type CredentialRow = {
  candidate_id: string;
  access_code_verifier: string | null;
  credential_revision: number | string | null;
  credential_status: string | null;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

function genericUnauthorized(status = 401) {
  return jsonNoStore({ ok: false, error: "No se pudo validar el acceso." }, status);
}

function serviceUnavailable() {
  return jsonNoStore({ ok: false, error: "No disponible." }, 503);
}

function currentRevision(row: CredentialRow | null) {
  if (!row) return null;
  const value = Number(row.credential_revision ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function POST(req: NextRequest) {
  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return genericUnauthorized(403);
  }

  if (!isJsonContentType(req)) {
    return genericUnauthorized(400);
  }

  let body: UnlockBody;
  try {
    body = (await req.json()) as UnlockBody;
  } catch {
    return genericUnauthorized(400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !UNLOCK_KEYS.has(key) || FORBIDDEN_LEGACY_KEYS.has(key)
    )
  ) {
    return genericUnauthorized(400);
  }

  const hasCandidateId = Object.prototype.hasOwnProperty.call(body, "candidateId");
  const hasAccessCode = Object.prototype.hasOwnProperty.call(body, "accessCode");

  if (
    !hasCandidateId ||
    !hasAccessCode ||
    typeof body.candidateId !== "string" ||
    typeof body.accessCode !== "string"
  ) {
    return genericUnauthorized(400);
  }

  const candidateIdInput = body.candidateId.trim();
  const credentialInputRaw = body.accessCode.trim();
  const normalizedAccessCode = normalizeCandidateAccessCode(credentialInputRaw);

  if (
    !candidateIdInput ||
    candidateIdInput.length > 160 ||
    /[\u0000-\u001f]/.test(candidateIdInput) ||
    !credentialInputRaw ||
    credentialInputRaw.length > 64 ||
    /[\u0000-\u001f]/.test(credentialInputRaw) ||
    !isValidCandidateAccessCode(normalizedAccessCode)
  ) {
    return genericUnauthorized(400);
  }

  const candidate = resolveCandidate(candidateIdInput);
  if (!candidate) {
    return genericUnauthorized(401);
  }

  const ipFingerprint = getIpFingerprint(req);
  if (!ipFingerprint.ok) {
    return serviceUnavailable();
  }

  const rate = await checkCandidatePanelRateLimit(
    candidate.storageCandidateId,
    ipFingerprint.value
  );
  if (!rate.ok) {
    return serviceUnavailable();
  }

  if (!rate.allowed) {
    return genericUnauthorized(429);
  }

  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("votoclaro_candidate_pins")
    .select("candidate_id,access_code_verifier,credential_revision,credential_status")
    .eq("candidate_id", candidate.storageCandidateId)
    .maybeSingle<CredentialRow>();

  if (error) {
    console.error("[candidate-panel] credential lookup failed", error.message);
    return serviceUnavailable();
  }

  const expectedRevision = currentRevision(data ?? null);

  if (!isActiveCredentialStatus(data?.credential_status)) {
    await recordCandidatePanelPinFailure(candidate.storageCandidateId, ipFingerprint.value);
    return genericUnauthorized(401);
  }

  if (expectedRevision === null) {
    console.error("[candidate-panel] invalid stored credential revision");
    return serviceUnavailable();
  }

  if (typeof data?.access_code_verifier !== "string" || !data.access_code_verifier) {
    console.error("[candidate-panel] stored credential configuration is invalid");
    return serviceUnavailable();
  }

  const accessCodeResult = await verifyCandidateAccessCode(
    normalizedAccessCode,
    data.access_code_verifier
  );

  if (!accessCodeResult.ok) {
    console.error("[candidate-panel] stored credential configuration is invalid");
    return serviceUnavailable();
  }

  if (!accessCodeResult.valid) {
    await recordCandidatePanelPinFailure(candidate.storageCandidateId, ipFingerprint.value);
    return genericUnauthorized(401);
  }

  await resetCandidatePanelRateLimit(candidate.storageCandidateId, ipFingerprint.value);
  await revokeCandidatePanelSession(req);

  const session = await createCandidatePanelSession(
    candidate.storageCandidateId,
    expectedRevision
  );
  if (!session) {
    return serviceUnavailable();
  }

  const response = jsonNoStore({
    ok: true,
    authenticated: true,
    candidateId: candidate.canonicalId,
    expiresAt: session.expiresAt,
  });

  return applyCandidatePanelCookie(response, session.token);
}
