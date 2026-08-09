import { type NextRequest } from "next/server";
import {
  buildParticipantSessionExpiry,
  createParticipantSessionToken,
  hashParticipantSessionToken,
  setParticipantSessionCookie,
} from "@/lib/participantSession";
import {
  checkParticipantLoginRateLimit,
  getParticipantIpFingerprint,
  getParticipantSupabaseAdmin,
  isAllowedParticipantMutationOrigin,
  isValidLegacyDeviceId,
  isValidParticipantAccessCode,
  normalizeLegacyDeviceId,
  normalizeParticipantAccessCode,
  participantError,
  participantJson,
  readBoundedJsonObject,
  recordParticipantLoginFailure,
  toSafeParticipant,
} from "@/lib/participantApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;
const MAX_SESSION_INSERT_ATTEMPTS = 3;

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);
    if (!body) {
      return participantError(400, "request_invalid");
    }

    const accessCode = normalizeParticipantAccessCode(body.codigo_acceso);
    const legacyDeviceId = normalizeLegacyDeviceId(body.device_id);

    if (
      !isValidParticipantAccessCode(accessCode) ||
      !isValidLegacyDeviceId(legacyDeviceId)
    ) {
      return participantError(400, "request_invalid");
    }

    const ipFingerprint = getParticipantIpFingerprint(req);
    if (!ipFingerprint.ok) {
      return participantError(503, "login_unavailable");
    }

    const supabase = getParticipantSupabaseAdmin();

    const rate = await checkParticipantLoginRateLimit(
      supabase,
      ipFingerprint.value
    );

    if (!rate.ok) {
      return participantError(503, "login_unavailable");
    }

    if (!rate.allowed) {
      return participantError(429, "credentials_invalid");
    }

    const { data: participant, error: participantLookupError } = await supabase
      .from("project_participants")
      .select("id,alias,full_name")
      .eq("codigo_acceso", accessCode)
      .limit(1)
      .maybeSingle();

    if (participantLookupError) {
      console.error("[participant-login] participant lookup failed");
      return participantError(503, "login_unavailable");
    }

    const safeParticipant = toSafeParticipant(participant ?? null);

    if (!safeParticipant) {
      const failure = await recordParticipantLoginFailure(
        supabase,
        ipFingerprint.value
      );

      if (!failure.ok) {
        return participantError(503, "login_unavailable");
      }

      return participantError(
        failure.allowed ? 401 : 429,
        "credentials_invalid"
      );
    }
    if (legacyDeviceId) {
      const { error: deviceUpdateError } = await supabase
        .from("project_participants")
        .update({ device_id: legacyDeviceId })
        .eq("id", safeParticipant.id);

      if (deviceUpdateError) {
        console.error("[participant-login] legacy device update failed");
        return participantError(503, "login_unavailable");
      }
    }

    const expiresAt = buildParticipantSessionExpiry();

    for (let attempt = 0; attempt < MAX_SESSION_INSERT_ATTEMPTS; attempt += 1) {
      const token = createParticipantSessionToken();
      const tokenHash = hashParticipantSessionToken(token);

      const { error: sessionInsertError } = await supabase
        .from("project_participant_sessions")
        .insert({
          participant_id: safeParticipant.id,
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
        });

      if (!sessionInsertError) {
        const response = participantJson(200, {
          ok: true,
          authenticated: true,
          participant: safeParticipant,
        });

        return setParticipantSessionCookie(response, token, expiresAt);
      }

      if ((sessionInsertError as { code?: string }).code !== "23505") {
        console.error("[participant-login] session creation failed");
        return participantError(503, "login_unavailable");
      }
    }

    console.error("[participant-login] session token collision limit reached");
    return participantError(503, "login_unavailable");
  } catch {
    console.error("[participant-login] unexpected failure");
    return participantError(503, "login_unavailable");
  }
}