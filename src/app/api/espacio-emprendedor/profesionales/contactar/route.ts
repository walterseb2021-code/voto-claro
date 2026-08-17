import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

function cleanText(value: unknown, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function buildThreadKey(
  professionalId: string,
  senderParticipantId: string,
  receiverParticipantId: string
) {
  const ordered = [
    String(senderParticipantId),
    String(receiverParticipantId),
  ].sort();

  return `${professionalId}:${ordered[0]}:${ordered[1]}`;
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
              ? "Debes iniciar sesión o registrarte para contactar a un profesional."
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

    const professionalId = cleanText(body.professional_id, 120);
    const content = cleanText(body.content, 1200);

    if (!professionalId) {
      return participantJson(400, {
        ok: false,
        error: "No se pudo identificar al profesional.",
      });
    }

    if (!content || content.length < 10) {
      return participantJson(400, {
        ok: false,
        error: "El mensaje debe tener al menos 10 caracteres.",
      });
    }

    const senderParticipantId = auth.participant.id;

    const { data: professional, error: professionalError } =
      await auth.supabase
        .from("espacio_profesionales")
        .select("id, participant_id, public_name, is_active, status")
        .eq("id", professionalId)
        .eq("is_active", true)
        .eq("status", "active")
        .maybeSingle();

    if (professionalError) {
      console.error("[professional-contact] professional lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo validar al profesional.",
      });
    }

    if (!professional) {
      return participantJson(404, {
        ok: false,
        error: "El profesional no está disponible para recibir mensajes.",
      });
    }

    const receiverParticipantId = String(professional.participant_id || "");

    if (!receiverParticipantId) {
      return participantJson(400, {
        ok: false,
        error: "No se pudo identificar al destinatario profesional.",
      });
    }

    if (receiverParticipantId === senderParticipantId) {
      return participantJson(400, {
        ok: false,
        error: "No puedes enviarte un mensaje a tu propia ficha profesional.",
      });
    }

    const threadKey = buildThreadKey(
      professionalId,
      senderParticipantId,
      receiverParticipantId
    );

    const { error: insertError } = await auth.supabase
      .from("espacio_profesional_mensajes")
      .insert({
        professional_id: professionalId,
        sender_participant_id: senderParticipantId,
        receiver_participant_id: receiverParticipantId,
        thread_key: threadKey,
        content,
        is_read: false,
        status: "active",
      });

    if (insertError) {
      console.error("[professional-contact] message insert failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo enviar el mensaje al profesional.",
      });
    }

    return participantJson(200, {
      ok: true,
      thread_key: threadKey,
      message:
        "Mensaje enviado correctamente. El profesional podrá responderte dentro de la plataforma.",
    });
  } catch {
    console.error("[professional-contact] unexpected failure");
    return participantJson(500, {
      ok: false,
      error: "No se pudo enviar el mensaje al profesional. Intenta nuevamente.",
    });
  }
}