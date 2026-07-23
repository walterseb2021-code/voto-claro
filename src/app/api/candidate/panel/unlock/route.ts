import { NextResponse, type NextRequest } from "next/server";
import {
  applyCandidatePanelCookie,
  checkCandidatePanelRateLimit,
  createCandidatePanelSession,
  getCandidatePanelAdminClient,
  getIpFingerprint,
  isValidPinFormat,
  recordCandidatePanelPinFailure,
  resetCandidatePanelRateLimit,
  resolveCandidate,
  revokeCandidatePanelSession,
  safeComparePin,
} from "@/lib/candidatePanelAuth";
import {
  isAllowedCandidatePanelMutationOrigin,
  isJsonContentType,
} from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";

type UnlockBody = {
  candidateId?: unknown;
  pin?: unknown;
};

const UNLOCK_KEYS = new Set(["candidateId", "pin"]);

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
  const pinInput = String(body.pin ?? "").trim();

  if (
    !candidateIdInput ||
    candidateIdInput.length > 160 ||
    /[\u0000-\u001f]/.test(candidateIdInput) ||
    !isValidPinFormat(pinInput)
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

  let storedPin: string | null = null;

  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("votoclaro_candidate_pins")
    .select("pin")
    .eq("candidate_id", candidate.storageCandidateId)
    .maybeSingle<{ pin: string }>();

  if (error) {
    console.error("[candidate-panel] PIN lookup failed", error.message);
    return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
  }

  storedPin = typeof data?.pin === "string" ? data.pin : null;

  const valid =
    Boolean(candidate && storedPin && isValidPinFormat(storedPin)) &&
    safeComparePin(pinInput, storedPin as string);

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
