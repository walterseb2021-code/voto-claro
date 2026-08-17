import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantJson(403, {
        ok: false,
        error: "Origen de solicitud no autorizado.",
      });
    }

    const auth = await resolveParticipantSession(req);

    if (!auth.ok) {
      return participantJson(
        auth.reason === "unauthenticated" ? 401 : 503,
        {
          ok: false,
          error:
            auth.reason === "unauthenticated"
              ? "Debes iniciar sesión nuevamente."
              : "No se pudo validar tu sesión en este momento.",
        }
      );
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);

    if (!body) {
      return participantJson(400, {
        ok: false,
        error: "Solicitud inválida.",
      });
    }

    const capacitacionId = cleanText(body.capacitacion_id, 120);

    if (!capacitacionId) {
      return participantJson(400, {
        ok: false,
        error: "No se pudo identificar la capacitación que deseas desactivar.",
      });
    }

    const participantId = auth.participant.id;

    const { data: professional, error: professionalError } =
      await auth.supabase
        .from("espacio_profesionales")
        .select("id")
        .eq("participant_id", participantId)
        .eq("is_active", true)
        .maybeSingle();

    if (professionalError) {
      console.error("[training-deactivate] professional lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo validar tu ficha profesional.",
      });
    }

    if (!professional) {
      return participantJson(403, {
        ok: false,
        error:
          "Para desactivar capacitaciones primero debes tener una ficha profesional activa.",
      });
    }

    const { data: updated, error: updateError } = await auth.supabase
      .from("espacio_capacitaciones")
      .update({
        status: "inactive",
        updated_at: new Date().toISOString(),
        updated_by_admin: false,
      })
      .eq("id", capacitacionId)
      .eq("participant_id", participantId)
      .eq("professional_id", professional.id)
      .select("id, title, status, updated_at")
      .maybeSingle();

    if (updateError) {
      console.error("[training-deactivate] update failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo desactivar la capacitación.",
      });
    }

    if (!updated) {
      return participantJson(404, {
        ok: false,
        error: "No se encontró una capacitación tuya con ese identificador.",
      });
    }

    return participantJson(200, {
      ok: true,
      message: "Capacitación desactivada correctamente.",
      capacitacion: updated,
    });
  } catch {
    console.error("[training-deactivate] unexpected failure");
    return participantJson(500, {
      ok: false,
      error: "No se pudo desactivar la capacitación. Intenta nuevamente.",
    });
  }
}