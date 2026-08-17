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

    const title = cleanText(body.title, 180);
    const description = cleanText(body.description, 1000) || null;
    const category = cleanText(body.category, 120);
    const resourceType = cleanText(body.resource_type, 120);
    const resourceUrl = cleanUrl(body.resource_url);

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
        .select("id, participant_id, public_name, status, is_active")
        .eq("participant_id", participantId)
        .eq("is_active", true)
        .eq("status", "active")
        .maybeSingle();

    if (professionalError) {
      console.error("[training-register] professional lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo validar tu ficha profesional.",
      });
    }

    if (!professional) {
      return participantJson(403, {
        ok: false,
        error:
          "Para publicar capacitación gratuita primero debes tener una ficha profesional activa.",
      });
    }

    const now = new Date().toISOString();

    const { error: insertError } = await auth.supabase
      .from("espacio_capacitaciones")
      .insert({
        professional_id: professional.id,
        participant_id: participantId,
        title,
        description,
        category,
        resource_type: resourceType,
        resource_url: resourceUrl,
        is_free: true,
        status: "active",
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      console.error("[training-register] insert failed");
      return participantJson(503, {
        ok: false,
        error:
          "No se pudo publicar la capacitación. Revisa los datos e intenta nuevamente.",
      });
    }

    return participantJson(200, {
      ok: true,
      message: "Capacitación gratuita publicada correctamente.",
    });
  } catch {
    console.error("[training-register] unexpected failure");
    return participantJson(500, {
      ok: false,
      error:
        "No se pudo publicar la capacitación. Revisa los datos e intenta nuevamente.",
    });
  }
}