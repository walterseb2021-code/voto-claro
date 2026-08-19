import { type NextRequest } from "next/server";
import {
  getParticipantSupabaseAdmin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  getEntrepreneurProjectRecord,
  isEntrepreneurMessageUuid,
  resolveEntrepreneurProjectViewer,
} from "@/lib/entrepreneurMessaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const projectId = String(id ?? "").trim();

    if (!isEntrepreneurMessageUuid(projectId)) {
      return participantError(400, "project_id_invalid");
    }

    const auth = await resolveParticipantSession(req);

    if (!auth.ok && auth.reason === "unavailable") {
      return participantError(503, "project_unavailable");
    }

    const supabase = auth.ok
      ? auth.supabase
      : getParticipantSupabaseAdmin();

    const projectResult = await getEntrepreneurProjectRecord(
      supabase,
      projectId
    );

    if (!projectResult.ok) {
      return participantError(503, "project_unavailable");
    }

    const project = projectResult.project;

    if (!project) {
      return participantError(404, "project_not_found");
    }

    let viewer = {
      authenticated: false,
      participant: null as any,
      affiliate_status: "missing",
      is_owner: false,
      can_message: false,
    };

    if (auth.ok) {
      const viewerResult = await resolveEntrepreneurProjectViewer(
        supabase,
        auth.participant.id,
        project.owner_affiliate_id
      );

      if (!viewerResult.ok) {
        return participantError(503, "project_unavailable");
      }

      viewer = {
        authenticated: true,
        participant: auth.participant,
        affiliate_status: viewerResult.affiliateStatus,
        is_owner: viewerResult.isOwner,
        can_message:
          project.owner_active &&
          project.status === "active" &&
          !viewerResult.isOwner,
      };
    }

    if (project.status !== "active" && !viewer.is_owner) {
      return participantError(404, "project_not_found");
    }

    return participantJson(200, {
      ok: true,
      project: {
        id: project.id,
        title: project.title,
        category: project.category,
        department: project.department,
        province: project.province,
        district: project.district,
        summary: project.summary,
        investment_min: project.investment_min,
        investment_max: project.investment_max,
        pdf_url: project.pdf_url,
        status: project.status,
        views: project.views,
        created_at: project.created_at,
        owner: {
          alias: project.owner_alias,
        },
      },
      viewer,
    });
  } catch {
    console.error("[entrepreneur-project-detail] unexpected failure");
    return participantError(503, "project_unavailable");
  }
}