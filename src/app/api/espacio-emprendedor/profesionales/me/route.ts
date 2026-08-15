import { type NextRequest } from "next/server";
import { participantJson } from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
              ? "Debes iniciar sesión nuevamente."
              : "No se pudo validar tu sesión en este momento.",
        }
      );
    }

    const { data: profile, error: profileError } = await auth.supabase
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
        data_truth_confirmed,
        terms_accepted,
        is_active,
        status,
        created_at,
        updated_at
      `
      )
      .eq("participant_id", auth.participant.id)
      .maybeSingle();

    if (profileError) {
      console.error("[professional-me] profile lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo cargar tu ficha profesional.",
      });
    }

    return participantJson(200, {
      ok: true,
      participant: auth.participant,
      profile: profile || null,
    });
  } catch {
    console.error("[professional-me] unexpected failure");

    return participantJson(500, {
      ok: false,
      error: "No se pudo cargar tu ficha profesional.",
    });
  }
}
