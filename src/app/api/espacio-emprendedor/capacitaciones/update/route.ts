import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanUrl(value: unknown) {
  const url = String(value || "").trim().slice(0, 1000);

  if (!url) return "";

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
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
    const title = cleanText(body.title, 180);
    const description = cleanText(body.description, 1000) || null;
    const category = cleanText(body.category, 120);
    const resourceType = cleanText(body.resource_type, 120);
    const resourceUrl = cleanUrl(body.resource_url);

    if (!capacitacionId) {
      return participantJson(400, {
        ok: false,
        error: "No se pudo identificar la capacitación que deseas editar.",
      });
    }

    if (!title || title.length < 4) {
      return participantJson(400, {
        ok: false,
        error: "Debes indicar un título válido para la capacitación.",
      });
    }

    if (!category) {
      return participantJson(400, {
        ok: false,
        error: "Debes seleccionar una categoría de capacitación.",
      });
    }

    if (!resourceType) {
      return participantJson(400, {
        ok: false,
        error: "Debes seleccionar el tipo de recurso educativo.",
      });
    }

    if (!resourceUrl) {
      return participantJson(400, {
        ok: false,
        error:
          "Debes ingresar un enlace válido que empiece con http:// o https://.",
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
      console.error("[training-update] professional lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo validar tu ficha profesional.",
      });
    }

    if (!professional) {
      return participantJson(403, {
        ok: false,
        error:
          "Para editar capacitaciones primero debes tener una ficha profesional activa.",
      });
    }

    const { data: updated, error: updateError } = await auth.supabase
      .from("espacio_capacitaciones")
      .update({
        title,
        description,
        category,
        resource_type: resourceType,
        resource_url: resourceUrl,
        updated_at: new Date().toISOString(),
        updated_by_admin: false,
      })
      .eq("id", capacitacionId)
      .eq("participant_id", participantId)
      .eq("professional_id", professional.id)
      .select(
        `
        id,
        title,
        description,
        category,
        resource_type,
        resource_url,
        status,
        created_at,
        updated_at,
        admin_note,
        reviewed_at,
        rejected_reason,
        updated_by_admin
      `
      )
      .maybeSingle();

    if (updateError) {
      console.error("[training-update] update failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo actualizar la capacitación.",
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
      message: "Capacitación actualizada correctamente.",
      capacitacion: updated,
    });
  } catch {
    console.error("[training-update] unexpected failure");
    return participantJson(500, {
      ok: false,
      error: "No se pudo actualizar la capacitación. Intenta nuevamente.",
    });
  }
}