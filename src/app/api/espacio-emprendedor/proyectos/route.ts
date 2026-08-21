import "server-only";

import { type NextRequest } from "next/server";
import {
  getParticipantSupabaseAdmin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveParticipantSession(req);

    if (!auth.ok && auth.reason === "unavailable") {
      return participantError(503, "projects_unavailable");
    }

    const supabase = auth.ok
      ? auth.supabase
      : getParticipantSupabaseAdmin();

    const { data: projects, error: projectsError } = await supabase
      .from("espacio_proyectos")
      .select(`
        id,
        title,
        category,
        department,
        district,
        summary,
        investment_min,
        investment_max,
        created_at
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (projectsError) {
      console.error("[entrepreneur-project-list] project lookup failed");
      return participantError(503, "projects_unavailable");
    }

    return participantJson(200, {
      ok: true,
      authenticated: auth.ok,
      projects: projects ?? [],
    });
  } catch {
    console.error("[entrepreneur-project-list] unexpected failure");
    return participantError(503, "projects_unavailable");
  }
}