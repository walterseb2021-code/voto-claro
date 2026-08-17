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

function cleanText(value: unknown, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

function getSafeName(value: unknown, fallback = "Profesional") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveParticipantSession(req);

    if (!auth.ok) {
      return participantJson(
        auth.reason === "unauthenticated" ? 401 : 503,
        {
          ok: false,
          error:
            auth.reason === "unauthenticated"
              ? "Debes iniciar sesión para ver tus conversaciones."
              : "No se pudo validar tu sesión en este momento.",
        }
      );
    }

    const participantId = auth.participant.id;

    const { data: messages, error: messagesError } = await auth.supabase
      .from("espacio_profesional_mensajes")
      .select(`
        id,
        professional_id,
        sender_participant_id,
        receiver_participant_id,
        thread_key,
        content,
        is_read,
        status,
        created_at
      `)
      .eq("status", "active")
      .or(
        `sender_participant_id.eq.${participantId},receiver_participant_id.eq.${participantId}`
      )
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[my-professional-messages] message lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudieron cargar tus conversaciones con profesionales.",
      });
    }

    const professionalIds = Array.from(
      new Set(
        (messages || [])
          .map((m: any) => m.professional_id)
          .filter(Boolean)
      )
    );

    const { data: professionals, error: professionalsError } =
      professionalIds.length
        ? await auth.supabase
            .from("espacio_profesionales")
            .select(
              "id, public_name, professional_type, codigo_profesional, participant_id"
            )
            .in("id", professionalIds)
        : { data: [] as any[], error: null };

    if (professionalsError) {
      console.error("[my-professional-messages] professional lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudieron cargar los profesionales de tus conversaciones.",
      });
    }

    const professionalMap = new Map<string, any>();

    (professionals || []).forEach((item: any) => {
      professionalMap.set(item.id, item);
    });

    const participantIds = Array.from(
      new Set(
        (messages || [])
          .flatMap((m: any) => [
            m.sender_participant_id,
            m.receiver_participant_id,
          ])
          .filter(Boolean)
      )
    );

    const { data: participants, error: participantsError } =
      participantIds.length
        ? await auth.supabase
            .from("project_participants")
            .select("id, alias, full_name")
            .in("id", participantIds)
        : { data: [] as any[], error: null };

    if (participantsError) {
      console.error("[my-professional-messages] participant lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudieron cargar los participantes de tus conversaciones.",
      });
    }

    const participantMap = new Map<string, any>();

    (participants || []).forEach((item: any) => {
      participantMap.set(item.id, item);
    });

    const conversationMap = new Map<string, any>();

    for (const msg of messages || []) {
      const professional = professionalMap.get(msg.professional_id);
      const threadKey =
        msg.thread_key ||
        `${msg.professional_id}:${msg.sender_participant_id}:${msg.receiver_participant_id}`;

      if (!conversationMap.has(threadKey)) {
        conversationMap.set(threadKey, {
          thread_key: threadKey,
          professional_id: msg.professional_id,
          professional_name: getSafeName(professional?.public_name),
          professional_type: professional?.professional_type || "",
          codigo_profesional: professional?.codigo_profesional || "",
          last_message_at: msg.created_at,
          messages: [],
        });
      }

      const conversation = conversationMap.get(threadKey);
      const sender = participantMap.get(msg.sender_participant_id);

      conversation.messages.push({
        id: msg.id,
        content: msg.content,
        is_read: msg.is_read,
        created_at: msg.created_at,
        sender_alias:
          sender?.alias ||
          sender?.full_name?.split(" ")[0] ||
          "Participante",
        is_from_me:
          String(msg.sender_participant_id) === String(participantId),
      });

      conversation.last_message_at = msg.created_at;
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
    );

    return participantJson(200, {
      ok: true,
      participant: {
        id: auth.participant.id,
        alias: auth.participant.alias,
      },
      conversations,
    });
  } catch {
    console.error("[my-professional-messages] unexpected GET failure");
    return participantJson(500, {
      ok: false,
      error: "No se pudieron cargar tus conversaciones con profesionales.",
    });
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
              ? "Debes iniciar sesión para responder."
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

    const threadKey = cleanText(body.thread_key, 300);
    const professionalId = cleanText(body.professional_id, 120);
    const content = cleanText(body.content, 1200);

    if (!threadKey || !professionalId) {
      return participantJson(400, {
        ok: false,
        error: "No se pudo identificar la conversación.",
      });
    }

    if (!content || content.length < 10) {
      return participantJson(400, {
        ok: false,
        error: "La respuesta debe tener al menos 10 caracteres.",
      });
    }

    const currentParticipantId = auth.participant.id;

    const { data: professional, error: professionalError } =
      await auth.supabase
        .from("espacio_profesionales")
        .select("id, participant_id, is_active, status")
        .eq("id", professionalId)
        .eq("is_active", true)
        .eq("status", "active")
        .maybeSingle();

    if (professionalError) {
      console.error("[my-professional-messages] professional lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo validar al profesional de esta conversación.",
      });
    }

    if (!professional) {
      return participantJson(404, {
        ok: false,
        error: "No se encontró el profesional asociado a esta conversación.",
      });
    }

    const { data: threadMessages, error: threadError } = await auth.supabase
      .from("espacio_profesional_mensajes")
      .select("id, sender_participant_id, receiver_participant_id")
      .eq("professional_id", professionalId)
      .eq("thread_key", threadKey)
      .eq("status", "active");

    if (threadError) {
      console.error("[my-professional-messages] thread lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo validar la conversación.",
      });
    }

    if (!threadMessages?.length) {
      return participantJson(404, {
        ok: false,
        error: "No se encontró una conversación válida para responder.",
      });
    }

    const isPartOfThread = threadMessages.some((msg: any) => {
      return (
        String(msg.sender_participant_id) === currentParticipantId ||
        String(msg.receiver_participant_id) === currentParticipantId
      );
    });

    if (!isPartOfThread) {
      return participantJson(403, {
        ok: false,
        error: "No tienes permiso para responder esta conversación.",
      });
    }

    const participantIds = new Set<string>();

    threadMessages.forEach((msg: any) => {
      if (msg.sender_participant_id) {
        participantIds.add(String(msg.sender_participant_id));
      }

      if (msg.receiver_participant_id) {
        participantIds.add(String(msg.receiver_participant_id));
      }
    });

    const receiverParticipantId = Array.from(participantIds).find(
      (id) => id !== currentParticipantId
    );

    if (!receiverParticipantId) {
      return participantJson(400, {
        ok: false,
        error: "No se pudo identificar al destinatario de la respuesta.",
      });
    }

    const { data: inserted, error: insertError } = await auth.supabase
      .from("espacio_profesional_mensajes")
      .insert({
        professional_id: professionalId,
        sender_participant_id: currentParticipantId,
        receiver_participant_id: receiverParticipantId,
        thread_key: threadKey,
        content,
        is_read: false,
        status: "active",
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("[my-professional-messages] reply insert failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo enviar la respuesta.",
      });
    }

    return participantJson(200, {
      ok: true,
      inserted,
      message: "Respuesta enviada correctamente.",
    });
  } catch {
    console.error("[my-professional-messages] unexpected POST failure");
    return participantJson(500, {
      ok: false,
      error: "No se pudo enviar la respuesta. Intenta nuevamente.",
    });
  }
}