import { type NextRequest } from "next/server";
import {
  buildParticipantSessionExpiry,
  createParticipantSessionToken,
  hashParticipantSessionToken,
  setParticipantSessionCookie,
} from "@/lib/participantSession";
import {
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
  toSafeParticipant,
} from "@/lib/participantApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8192;
const MAX_SESSION_TOKEN_ATTEMPTS = 3;
const DATA_PROCESSING_VERSION = "participant-data-v1-2026-08-10";
const PARTICIPATION_RULES_VERSION = "participant-rules-v1-2026-08-10";

function normalizeText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength ? normalized : "";
}

function hasControlChars(value: string) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function isValidEmail(value: string) {
  return (
    value.length >= 3 &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function isValidPhone(value: string) {
  return /^\+?[0-9]{6,15}$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);
    if (!body) {
      return participantError(400, "request_invalid");
    }

    const fullName = normalizeText(body.full_name, 120);
    const dni = String(body.dni ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const address = normalizeText(body.address, 200);
    const district = normalizeText(body.district, 120);
    const alias = normalizeText(body.alias, 80);
    const legacyDeviceId = normalizeLegacyDeviceId(body.device_id);
    const consentAccepted = body.consent_accepted === true;

    if (
      fullName.length < 2 ||
      !/^[0-9]{8}$/.test(dni) ||
      !isValidEmail(email) ||
      !isValidPhone(phone) ||
      address.length < 3 ||
      district.length < 2 ||
      alias.length < 2 ||
      !isValidLegacyDeviceId(legacyDeviceId) ||
      !legacyDeviceId ||
      !consentAccepted ||
      hasControlChars(fullName) ||
      hasControlChars(email) ||
      hasControlChars(phone) ||
      hasControlChars(address) ||
      hasControlChars(district) ||
      hasControlChars(alias)
    ) {
      return participantError(400, "request_invalid");
    }

    const ipFingerprint = getParticipantIpFingerprint(req);
    if (!ipFingerprint.ok) {
      return participantError(503, "registration_unavailable");
    }

    const supabase = getParticipantSupabaseAdmin();

    const { data: rateData, error: rateError } = await supabase.rpc(
      "consume_project_participant_registration_attempt",
      {
        p_ip_fingerprint: ipFingerprint.value,
      }
    );

    if (rateError) {
      console.error("[participant-register] rate limit check failed");
      return participantError(503, "registration_unavailable");
    }

    const rateRow = Array.isArray(rateData) ? rateData[0] : rateData;
    if (!rateRow?.allowed) {
      return participantError(429, "registration_rate_limited");
    }

    for (
      let attempt = 0;
      attempt < MAX_SESSION_TOKEN_ATTEMPTS;
      attempt += 1
    ) {
      const token = createParticipantSessionToken();
      const tokenHash = hashParticipantSessionToken(token);
      const expiresAt = buildParticipantSessionExpiry();

      const { data, error } = await supabase.rpc(
        "register_project_participant_secure",
        {
          p_full_name: fullName,
          p_dni: dni,
          p_email: email,
          p_phone: phone,
          p_address: address,
          p_district: district,
          p_alias: alias,
          p_device_id: legacyDeviceId,
          p_consent_accepted: true,
          p_data_processing_version: DATA_PROCESSING_VERSION,
          p_participation_rules_version: PARTICIPATION_RULES_VERSION,
          p_token_hash: tokenHash,
          p_expires_at: expiresAt.toISOString(),
        }
      );

      if (error) {
        const message = String(error.message ?? "");

        if (
          error.code === "P0001" &&
          message.includes("participant_exists")
        ) {
          return participantError(409, "participant_exists");
        }

        if (
          error.code === "P0001" &&
          (message.includes("registration_invalid") ||
            message.includes("consent_required"))
        ) {
          return participantError(400, "request_invalid");
        }

        if (error.code === "23505") {
          continue;
        }

        console.error("[participant-register] atomic registration failed");
        return participantError(503, "registration_unavailable");
      }

      const row = Array.isArray(data) ? data[0] : data;
      const safeParticipant = toSafeParticipant({
        id: row?.participant_id,
        alias: row?.alias,
        full_name: row?.full_name,
      });
      const accessCode = normalizeParticipantAccessCode(row?.codigo_acceso);

      if (
        !safeParticipant ||
        !isValidParticipantAccessCode(accessCode)
      ) {
        console.error("[participant-register] invalid registration result");
        return participantError(503, "registration_unavailable");
      }

      const response = participantJson(201, {
        ok: true,
        authenticated: true,
        participant: safeParticipant,
        codigo_acceso: accessCode,
      });

      return setParticipantSessionCookie(response, token, expiresAt);
    }

    console.error("[participant-register] session token collision limit reached");
    return participantError(503, "registration_unavailable");
  } catch {
    console.error("[participant-register] unexpected failure");
    return participantError(503, "registration_unavailable");
  }
}