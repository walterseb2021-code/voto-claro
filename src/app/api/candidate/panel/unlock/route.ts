import { NextResponse, type NextRequest } from "next/server";
import {
  applyCandidatePanelCookie,
  checkCandidatePanelRateLimit,
  createCandidatePanelSession,
  getCandidatePanelAdminClient,
  getIpFingerprint,
  isValidCandidateAccessCode,
  isValidPinFormat,
  normalizeCandidateAccessCode,
  recordCandidatePanelPinFailure,
  resetCandidatePanelRateLimit,
  resolveCandidate,
  revokeCandidatePanelSession,
  safeComparePin,
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
  pin?: unknown;
};

const UNLOCK_KEYS = new Set(["candidateId", "accessCode", "pin"]);

type CredentialRow = {
  candidate_id: string;
  pin: string | null;
  access_code_verifier: string | null;
  credential_revision: number | string | null;
};

function genericUnauthorized(status = 401) {
  return NextResponse.json(
    { ok: false, error: "No se pudo validar el acceso." },
    { status }
  );
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
    Object.keys(body).some((key) => !UNLOCK_KEYS.has(key))
  ) {
    return genericUnauthorized(400);
  }

  const candidateIdInput = String(body.candidateId ?? "").trim();
  const hasAccessCode = Object.prototype.hasOwnProperty.call(body, "accessCode");
  const hasLegacyPin = Object.prototype.hasOwnProperty.call(body, "pin");

  if (hasAccessCode === hasLegacyPin) {
    return genericUnauthorized(400);
  }

  const credentialInputRaw = String(
    hasAccessCode ? body.accessCode ?? "" : body.pin ?? ""
  ).trim();

  if (
    !candidateIdInput ||
    candidateIdInput.length > 160 ||
    /[\u0000-\u001f]/.test(candidateIdInput) ||
    !credentialInputRaw ||
    credentialInputRaw.length > 64 ||
    /[\u0000-\u001f]/.test(credentialInputRaw)
  ) {
    return genericUnauthorized(400);
  }

  const candidate = resolveCandidate(candidateIdInput);
  if (!candidate) {
    return genericUnauthorized(401);
  }

  const ipFingerprint = getIpFingerprint(req);
  if (!ipFingerprint.ok) {
    return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
  }

  const rate = await checkCandidatePanelRateLimit(
    candidate.storageCandidateId,
    ipFingerprint.value
  );
  if (!rate.ok) {
    return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
  }

  if (!rate.allowed) {
    return genericUnauthorized(429);
  }

  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("votoclaro_candidate_pins")
    .select("candidate_id,pin,access_code_verifier,credential_revision")
    .eq("candidate_id", candidate.storageCandidateId)
    .maybeSingle<CredentialRow>();

  if (error) {
    console.error("[candidate-panel] credential lookup failed", error.message);
    return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
  }

  let valid = false;

  if (typeof data?.access_code_verifier === "string" && data.access_code_verifier) {
    const normalizedAccessCode = normalizeCandidateAccessCode(credentialInputRaw);
    if (isValidCandidateAccessCode(normalizedAccessCode)) {
      const accessCodeResult = await verifyCandidateAccessCode(
        normalizedAccessCode,
        data.access_code_verifier
      );

      if (!accessCodeResult.ok) {
        console.error(
          "[candidate-panel] stored credential configuration is invalid",
          candidate.storageCandidateId
        );
        return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
      }

      valid = accessCodeResult.valid;
    }
  } else {
    const storedPin = typeof data?.pin === "string" ? data.pin : null;
    valid =
      Boolean(storedPin && isValidPinFormat(storedPin) && isValidPinFormat(credentialInputRaw)) &&
      safeComparePin(credentialInputRaw, storedPin as string);
  }

  if (!valid) {
    await recordCandidatePanelPinFailure(candidate.storageCandidateId, ipFingerprint.value);
    return genericUnauthorized(401);
  }

  await resetCandidatePanelRateLimit(candidate.storageCandidateId, ipFingerprint.value);
  await revokeCandidatePanelSession(req);

  const session = await createCandidatePanelSession(candidate.storageCandidateId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
  }

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    candidateId: candidate.canonicalId,
    expiresAt: session.expiresAt,
  });

  return applyCandidatePanelCookie(response, session.token);
}
