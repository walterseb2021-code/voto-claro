import "server-only";

import { type NextRequest } from "next/server";

import {
  isAllowedParticipantMutationOrigin,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { RETO_PRIZES_ENABLED, type RetoGameCode } from "@/lib/retoGameRules";
import {
  resolveSecureRetoContext,
  type RetoSessionRow,
  type SecureRetoContextResult,
} from "@/lib/retoSecureGame";

const MAX_BODY_BYTES = 8 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SecureRetoContext = Extract<SecureRetoContextResult, { ok: true }>;

export type RetoPrizeMutationPrelude =
  | {
      ok: true;
      body: Record<string, unknown>;
      context: SecureRetoContext;
    }
  | {
      ok: false;
      response: ReturnType<typeof participantJson>;
    };

function hasOnlyKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[]
) {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
}

export async function resolveRetoPrizeMutation(
  req: NextRequest,
  allowedKeys: readonly string[]
): Promise<RetoPrizeMutationPrelude> {
  if (!isAllowedParticipantMutationOrigin(req)) {
    return {
      ok: false,
      response: participantJson(403, {
        ok: false,
        code: "RETO_ORIGIN_FORBIDDEN",
        error: "Origen de solicitud no autorizado.",
      }),
    };
  }

  const context = await resolveSecureRetoContext(req);

  if (!context.ok) {
    if (context.reason === "unauthenticated") {
      return {
        ok: false,
        response: participantJson(401, {
          ok: false,
          code: "RETO_SESSION_REQUIRED",
          error: "Debes iniciar sesión nuevamente.",
        }),
      };
    }

    if (context.reason === "pitch_invalid") {
      return {
        ok: false,
        response: participantJson(403, {
          ok: false,
          code: "RETO_PITCH_REQUIRED",
          error: "El acceso actual no está autorizado para Reto Ciudadano.",
        }),
      };
    }

    return {
      ok: false,
      response: participantJson(503, {
        ok: false,
        code: "RETO_AUTH_UNAVAILABLE",
        error: "No se pudo validar el acceso en este momento.",
      }),
    };
  }

  const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);

  if (!body || !hasOnlyKeys(body, allowedKeys)) {
    return {
      ok: false,
      response: participantJson(400, {
        ok: false,
        code: "RETO_REQUEST_INVALID",
        error: "Solicitud inválida.",
      }),
    };
  }

  if (!RETO_PRIZES_ENABLED) {
    return {
      ok: false,
      response: participantJson(423, {
        ok: false,
        code: "RETO_PRIZES_DISABLED",
        error: "La modalidad con premio está temporalmente deshabilitada.",
      }),
    };
  }

  return { ok: true, body, context };
}

export function parseRetoGameCode(value: unknown): RetoGameCode | null {
  return value === "principal" || value === "camino" ? value : null;
}

export function parseRetoUuid(value: unknown) {
  const text = String(value ?? "").trim();
  return UUID_RE.test(text) ? text : null;
}

export function parseRetoStateVersion(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}

export function parseRetoAnswer(value: unknown) {
  return value === true || value === false || value === null
    ? value
    : undefined;
}

export function publicRetoSession(session: RetoSessionRow) {
  return {
    id: session.id,
    game_code: session.game_code,
    status: session.status,
    state_version: session.state_version,
    started_at: session.started_at,
    expires_at: session.expires_at,
    finished_at: session.finished_at,
  };
}

export function retoConflict(code = "RETO_STATE_CONFLICT") {
  return participantJson(409, {
    ok: false,
    code,
    error: "El estado del juego cambió. Actualiza el juego e inténtalo nuevamente.",
  });
}

export function retoUnavailable(code = "RETO_UNAVAILABLE") {
  return participantJson(503, {
    ok: false,
    code,
    error: "Reto Ciudadano no está disponible en este momento.",
  });
}
