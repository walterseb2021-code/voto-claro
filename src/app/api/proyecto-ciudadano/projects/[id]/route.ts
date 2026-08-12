import { type NextRequest } from "next/server";
import {
  getParticipantSupabaseAdmin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  isProjectCommunityUuid,
  toPublicForumPost,
  toPublicProject,
} from "@/lib/projectCommunity";
import { getConfiguredProjectCycle } from "@/lib/projectSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const projectId = String(id ?? "").trim();

    if (!isProjectCommunityUuid(projectId)) {
      return participantError(400, "project_id_invalid");
    }

    const auth = await resolveParticipantSession(req);

    if (!auth.ok && auth.reason === "unavailable") {
      return participantError(503, "project_unavailable");
    }

    const supabase = auth.ok
      ? auth.supabase
      : getParticipantSupabaseAdmin();

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select(`
        id,
        cycle_id,
        name,
        category,
        objective,
        description,
        district,
        department,
        pdf_url,
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
      .eq("id", projectId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (projectError) {
      console.error("[project-community-detail] project lookup failed");
      return participantError(503, "project_unavailable");
    }

    if (!projectRow) {
      return participantError(404, "project_not_found");
    }

    const project = toPublicProject(
      projectRow as unknown as Record<string, unknown>
    );

    if (!project) {
      console.error("[project-community-detail] invalid project payload");
      return participantError(503, "project_unavailable");
    }

    const cycleId =
      typeof projectRow.cycle_id === "string"
        ? projectRow.cycle_id.trim()
        : "";

    const { data: forumRows, error: forumError } = await supabase
      .from("project_forum_posts")
      .select(`
        id,
        content,
        created_at,
        participant:project_participants!participant_id (
          alias
        )
      `)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (forumError) {
      console.error("[project-community-detail] forum lookup failed");
      return participantError(503, "project_unavailable");
    }

    const forum = (forumRows ?? [])
      .map((row) =>
        toPublicForumPost(row as unknown as Record<string, unknown>)
      )
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const cycleResult = await getConfiguredProjectCycle(supabase);
    const supportOpen =
      Boolean(cycleId) &&
      cycleResult.ok &&
      Boolean(cycleResult.cycle) &&
      cycleResult.cycle!.id === cycleId &&
      cycleResult.cycle!.submission_open;

    let supporting = false;
    let hasCycleSupport = false;

    if (auth.ok && cycleId) {
      const { data: supportRow, error: supportError } = await supabase
        .from("project_supports")
        .select("project_id")
        .eq("participant_id", auth.participant.id)
        .eq("cycle_id", cycleId)
        .limit(1)
        .maybeSingle();

      if (supportError) {
        console.error("[project-community-detail] support lookup failed");
        return participantError(503, "project_unavailable");
      }

      hasCycleSupport = Boolean(supportRow?.project_id);
      supporting = supportRow?.project_id === projectId;
    }

    return participantJson(200, {
      ok: true,
      project,
      forum,
      participant: auth.ok ? auth.participant : null,
      authenticated: auth.ok,
      supporting,
      has_cycle_support: hasCycleSupport,
      support_open: supportOpen,
      forum_open: auth.ok,
    });
  } catch {
    console.error("[project-community-detail] unexpected failure");
    return participantError(503, "project_unavailable");
  }
}