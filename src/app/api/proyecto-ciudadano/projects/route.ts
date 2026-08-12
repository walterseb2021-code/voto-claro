import {
  getParticipantSupabaseAdmin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { toPublicProject } from "@/lib/projectCommunity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getParticipantSupabaseAdmin();

    const { data, error } = await supabase
      .from("projects")
      .select(`
        id,
        name,
        category,
        objective,
        district,
        department,
        beneficiary_count,
        created_at,
        status,
        requested_budget,
        budget_category,
        minimum_supports_required,
        eligible_for_final_review,
        leader:project_participants!leader_id (
          alias
        )
      `)
      .eq("status", "active")
      .order("beneficiary_count", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[project-community-list] project lookup failed");
      return participantError(503, "projects_unavailable");
    }

    const projects = (data ?? [])
      .map((row) =>
        toPublicProject(row as unknown as Record<string, unknown>)
      )
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((project) => ({
        id: project.id,
        name: project.name,
        category: project.category,
        objective: project.objective,
        district: project.district,
        department: project.department,
        beneficiary_count: project.beneficiary_count,
        created_at: project.created_at,
        status: project.status,
        requested_budget: project.requested_budget,
        budget_category: project.budget_category,
        minimum_supports_required: project.minimum_supports_required,
        eligible_for_final_review: project.eligible_for_final_review,
        leader: project.leader,
      }));

    return participantJson(200, {
      ok: true,
      projects,
    });
  } catch {
    console.error("[project-community-list] unexpected failure");
    return participantError(503, "projects_unavailable");
  }
}