import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  buildEntrepreneurMessageThreadKey,
  cleanEntrepreneurMessageContent,
  ENTREPRENEUR_MESSAGE_MAX_PER_HOUR,
  getEntrepreneurProjectRecord,
  getParticipantAliasMap,
  isEntrepreneurMessageUuid,
  loadEntrepreneurMessageThread,
  loadEntrepreneurOwnerThreadSummaries,
  resolveEntrepreneurProjectViewer,
} from "@/lib/entrepreneurMessaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
const BODY_KEYS = new Set(["content", "investor_id"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveRequestContext(
  req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const projectId = String(id ?? "").trim();

  if (!isEntrepreneurMessageUuid(projectId)) {
    return {
      ok: false as const,
      response: participantError(400, "project_id_invalid"),
    };
  }

  const auth = await resolveParticipantSession(req);

  if (!auth.ok) {
    return {
      ok: false as const,
      response: participantError(
        auth.reason === "unauthenticated" ? 401 : 503,
        auth.reason === "unauthenticated"
          ? "participant_session_required"
          : "messages_unavailable"
      ),
    };
  }

  const projectResult = await getEntrepreneurProjectRecord(
    auth.supabase,
    projectId
  );

  if (!projectResult.ok) {
    return {
      ok: false as const,
      response: participantError(503, "messages_unavailable"),
    };
  }

  const project = projectResult.project;

  if (!project) {
    return {
      ok: false as const,
      response: participantError(404, "project_not_found"),
    };
  }

  const viewer = await resolveEntrepreneurProjectViewer(
    auth.supabase,
    auth.participant.id,
    project.owner_affiliate_id
  );

  if (!viewer.ok) {
    return {
      ok: false as const,
      response: participantError(503, "messages_unavailable"),
    };
  }

  if (project.status !== "active" && !viewer.isOwner) {
    return {
      ok: false as const,
      response: participantError(404, "project_not_found"),
    };
  }

  return {
    ok: true as const,
    projectId,
    auth,
    project,
    viewer,
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const resolved = await resolveRequestContext(req, context);
    if (!resolved.ok) return resolved.response;

    const { projectId, auth, viewer } = resolved;
    const investorParam = String(
      req.nextUrl.searchParams.get("investor_id") ?? ""
    ).trim();

    if (viewer.isOwner) {
      if (!investorParam) {
        const summaries = await loadEntrepreneurOwnerThreadSummaries(
          auth.supabase,
          projectId
        );

        if (!summaries.ok) {
          return participantError(503, "messages_unavailable");
        }

        return participantJson(200, {
          ok: true,
          mode: "owner",
          threads: summaries.threads,
        });
      }

      if (!isEntrepreneurMessageUuid(investorParam)) {
        return participantError(400, "investor_id_invalid");
      }

      const thread = await loadEntrepreneurMessageThread(
        auth.supabase,
        projectId,
        investorParam
      );

      if (!thread.ok) {
        return participantError(
          thread.reason === "invalid" ? 400 : 503,
          thread.reason === "invalid"
            ? "thread_invalid"
            : "messages_unavailable"
        );
      }

      if (thread.messages.length === 0) {
        return participantError(404, "thread_not_found");
      }

      const aliases = await getParticipantAliasMap(
        auth.supabase,
        [investorParam]
      );

      if (!aliases.ok) {
        return participantError(503, "messages_unavailable");
      }

      return participantJson(200, {
        ok: true,
        mode: "owner",
        investor: {
          id: investorParam,
          alias: aliases.aliases.get(investorParam) ?? "Inversionista",
        },
        thread_key: thread.threadKey,
        messages: thread.messages,
      });
    }

    if (investorParam) {
      return participantError(400, "investor_id_not_allowed");
    }

    const thread = await loadEntrepreneurMessageThread(
      auth.supabase,
      projectId,
      auth.participant.id
    );

    if (!thread.ok) {
      return participantError(
        thread.reason === "invalid" ? 400 : 503,
        thread.reason === "invalid"
          ? "thread_invalid"
          : "messages_unavailable"
      );
    }

    return participantJson(200, {
      ok: true,
      mode: "investor",
      investor: {
        id: auth.participant.id,
        alias: auth.participant.alias ?? "Inversionista",
      },
      thread_key: thread.threadKey,
      messages: thread.messages,
    });
  } catch {
    console.error("[entrepreneur-messages] GET unexpected failure");
    return participantError(503, "messages_unavailable");
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

    const resolved = await resolveRequestContext(req, context);
    if (!resolved.ok) return resolved.response;

    const { projectId, auth, project, viewer } = resolved;

    if (project.status !== "active" || !project.owner_active) {
      return participantError(409, "project_not_contactable");
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);
    if (
      !body ||
      Object.keys(body).some((key) => !BODY_KEYS.has(key))
    ) {
      return participantError(400, "request_invalid");
    }

    const content = cleanEntrepreneurMessageContent(body.content);
    if (!content) {
      return participantError(400, "message_invalid");
    }

    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    if (viewer.isOwner) {
      const affiliate = viewer.affiliate;
      const investorId = String(body.investor_id ?? "").trim();

      if (
        !affiliate ||
        !isEntrepreneurMessageUuid(investorId) ||
        investorId === auth.participant.id
      ) {
        return participantError(400, "investor_id_invalid");
      }

      const threadKey = buildEntrepreneurMessageThreadKey(
        projectId,
        investorId
      );

      if (!threadKey) {
        return participantError(400, "thread_invalid");
      }

      const { count: existingCount, error: existingError } =
        await auth.supabase
          .from("espacio_mensajes")
          .select("id", { count: "exact", head: true })
          .eq("proyecto_id", projectId)
          .eq("thread_key", threadKey);

      if (existingError) {
        console.error("[entrepreneur-messages] owner thread authorization failed");
        return participantError(503, "messages_unavailable");
      }

      if ((existingCount ?? 0) < 1) {
        return participantError(403, "thread_not_authorized");
      }

      const { data: investor, error: investorError } = await auth.supabase
        .from("project_participants")
        .select("id")
        .eq("id", investorId)
        .limit(1)
        .maybeSingle();

      if (investorError) {
        console.error("[entrepreneur-messages] investor identity lookup failed");
        return participantError(503, "messages_unavailable");
      }

      if (!investor?.id) {
        return participantError(404, "investor_not_found");
      }

      const { count: recentCount, error: rateError } = await auth.supabase
        .from("espacio_mensajes")
        .select("id", { count: "exact", head: true })
        .eq("sender_type", "emprendedor")
        .eq("sender_afiliado_id", affiliate.id)
        .gte("created_at", oneHourAgo);

      if (rateError) {
        console.error("[entrepreneur-messages] owner rate lookup failed");
        return participantError(503, "messages_unavailable");
      }

      if ((recentCount ?? 0) >= ENTREPRENEUR_MESSAGE_MAX_PER_HOUR) {
        return participantError(429, "message_rate_limited");
      }

      const { data: inserted, error: insertError } = await auth.supabase
        .from("espacio_mensajes")
        .insert({
          proyecto_id: projectId,
          sender_type: "emprendedor",
          content,
          sender_afiliado_id: affiliate.id,
          sender_participant_id: null,
          thread_key: threadKey,
          destinatario_participant_id: investorId,
          destinatario_afiliado_id: null,
          leido: false,
        })
        .select("id,sender_type,content,thread_key,leido,created_at")
        .single();

      if (insertError || !inserted?.id) {
        console.error("[entrepreneur-messages] owner insert failed");
        return participantError(503, "message_send_unavailable");
      }

      return participantJson(201, {
        ok: true,
        message: inserted,
      });
    }

    if (body.investor_id !== undefined && body.investor_id !== null) {
      return participantError(400, "investor_id_not_allowed");
    }

    const ownerAffiliateId = project.owner_affiliate_id;

    if (!ownerAffiliateId) {
      return participantError(409, "project_not_contactable");
    }

    const threadKey = buildEntrepreneurMessageThreadKey(
      projectId,
      auth.participant.id
    );

    if (!threadKey) {
      return participantError(400, "thread_invalid");
    }

    const { count: recentCount, error: rateError } = await auth.supabase
      .from("espacio_mensajes")
      .select("id", { count: "exact", head: true })
      .eq("sender_type", "inversionista")
      .eq("sender_participant_id", auth.participant.id)
      .gte("created_at", oneHourAgo);

    if (rateError) {
      console.error("[entrepreneur-messages] investor rate lookup failed");
      return participantError(503, "messages_unavailable");
    }

    if ((recentCount ?? 0) >= ENTREPRENEUR_MESSAGE_MAX_PER_HOUR) {
      return participantError(429, "message_rate_limited");
    }

    const { data: inserted, error: insertError } = await auth.supabase
      .from("espacio_mensajes")
      .insert({
        proyecto_id: projectId,
        sender_type: "inversionista",
        content,
        sender_afiliado_id: null,
        sender_participant_id: auth.participant.id,
        thread_key: threadKey,
        destinatario_participant_id: null,
        destinatario_afiliado_id: ownerAffiliateId,
        leido: false,
      })
      .select("id,sender_type,content,thread_key,leido,created_at")
      .single();

    if (insertError || !inserted?.id) {
      console.error("[entrepreneur-messages] investor insert failed");
      return participantError(503, "message_send_unavailable");
    }

    return participantJson(201, {
      ok: true,
      message: inserted,
    });
  } catch {
    console.error("[entrepreneur-messages] POST unexpected failure");
    return participantError(503, "message_send_unavailable");
  }
}