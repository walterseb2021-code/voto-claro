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

    const participantId = auth.participant.id;

    const { data: professional, error: professionalError } =
      await auth.supabase
        .from("espacio_profesionales")
        .select("id, codigo_profesional, public_name")
        .eq("participant_id", participantId)
        .eq("is_active", true)
        .maybeSingle();

    if (professionalError) {
      console.error("[training-mine] professional lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo validar tu ficha profesional.",
      });
    }

    if (!professional) {
      return participantJson(403, {
        ok: false,
        error:
          "Para administrar capacitaciones primero debes tener una ficha profesional activa.",
      });
    }

    const { data: capacitaciones, error } = await auth.supabase
      .from("espacio_capacitaciones")
      .select(
        `
        id,
        professional_id,
        participant_id,
        title,
        description,
        category,
        resource_type,
        resource_url,
        is_free,
        status,
        created_at,
        updated_at,
        admin_note,
        reviewed_at,
        rejected_reason,
        updated_by_admin
      `
      )
      .eq("participant_id", participantId)
      .eq("professional_id", professional.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[training-mine] list failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudieron cargar tus capacitaciones publicadas.",
      });
    }

    return participantJson(200, {
      ok: true,
      professional,
      count: capacitaciones?.length || 0,
      capacitaciones: capacitaciones || [],
    });
  } catch {
    console.error("[training-mine] unexpected failure");
    return participantJson(500, {
      ok: false,
      error: "No se pudieron cargar tus capacitaciones publicadas.",
    });
  }
}