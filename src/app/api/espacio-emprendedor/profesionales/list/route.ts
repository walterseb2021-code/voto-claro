import { type NextRequest } from "next/server";
import {
  getParticipantSupabaseAdmin,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveParticipantSession(req);
    const admin = auth.ok
      ? auth.supabase
      : getParticipantSupabaseAdmin();

    if (!auth.ok && auth.reason === "unavailable") {
      console.error("[professional-list] optional session lookup unavailable");
    }

    const currentParticipantId = auth.ok ? auth.participant.id : null;

    const { data, error } = await admin
      .from("espacio_profesionales")
      .select(
        `
        id,
        participant_id,
        codigo_profesional,
        public_name,
        professional_type,
        specialties,
        services,
        department,
        province,
        district,
        attention_mode,
        service_mode,
        service_mode_note,
        educational_activities,
        training_categories,
        experience_summary,
        public_message,
        document_url,
        is_active,
        status,
        created_at
      `
      )
      .eq("is_active", true)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[professional-list] directory lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo cargar el directorio de profesionales.",
      });
    }

    const professionals = (data || []).map((item) => ({
      id: item.id,
      codigo_profesional: item.codigo_profesional,
      public_name: item.public_name,
      professional_type: item.professional_type,
      specialties: item.specialties || [],
      services: item.services || [],
      department: item.department,
      province: item.province,
      district: item.district,
      attention_mode: item.attention_mode,
      service_mode: item.service_mode || "No especificado",
      service_mode_note: item.service_mode_note || null,
      educational_activities: item.educational_activities || [],
      training_categories: item.training_categories || [],
      experience_summary: item.experience_summary,
      public_message: item.public_message,
      document_url: item.document_url,
      created_at: item.created_at,
      is_mine:
        Boolean(currentParticipantId) &&
        String(item.participant_id || "") === String(currentParticipantId),
    }));

    return participantJson(200, {
      ok: true,
      currentParticipantDetected: Boolean(currentParticipantId),
      professionals,
    });
  } catch {
    console.error("[professional-list] unexpected failure");
    return participantJson(500, {
      ok: false,
      error: "No se pudo cargar el directorio de profesionales.",
    });
  }
}