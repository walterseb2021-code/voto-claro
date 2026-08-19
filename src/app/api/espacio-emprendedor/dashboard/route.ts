import { type NextRequest } from "next/server";
import {
  getParticipantSupabaseAdmin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import { resolveEntrepreneurAffiliate } from "@/lib/entrepreneurProject";
import {
  buildEntrepreneurMessageThreadKey,
  getParticipantAliasMap,
  isEntrepreneurMessageUuid,
} from "@/lib/entrepreneurMessaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function messageContent(value: unknown) {
  return cleanText(value, 2000);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveParticipantSession(req);

    if (!auth.ok && auth.reason === "unavailable") {
      return participantError(503, "entrepreneur_dashboard_unavailable");
    }

    const supabase = auth.ok
      ? auth.supabase
      : getParticipantSupabaseAdmin();

    const { data: activeProjects, error: projectsError } = await supabase
      .from("espacio_proyectos")
      .select("id,title,category,department")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500);

    if (projectsError) {
      console.error("[entrepreneur-dashboard] public projects lookup failed");
      return participantError(503, "entrepreneur_dashboard_unavailable");
    }

    const { data: investorMessages, error: contactError } = await supabase
      .from("espacio_mensajes")
      .select("proyecto_id,sender_participant_id,thread_key")
      .eq("sender_type", "inversionista")
      .neq("thread_key", "legacy-no-thread")
      .limit(5000);

    if (contactError) {
      console.error("[entrepreneur-dashboard] public contact count failed");
      return participantError(503, "entrepreneur_dashboard_unavailable");
    }

    const contactsByProject = new Map<string, Set<string>>();

    for (const row of investorMessages ?? []) {
      const projectId = String(row?.proyecto_id ?? "");
      const participantId = String(row?.sender_participant_id ?? "");
      const expectedThread = buildEntrepreneurMessageThreadKey(
        projectId,
        participantId
      );

      if (
        !expectedThread ||
        String(row?.thread_key ?? "") !== expectedThread
      ) {
        continue;
      }

      if (!contactsByProject.has(projectId)) {
        contactsByProject.set(projectId, new Set<string>());
      }

      contactsByProject.get(projectId)!.add(participantId);
    }

    const topProjects = (activeProjects ?? [])
      .map((project: any) => ({
        id: String(project.id),
        title: cleanText(project.title, 300),
        category: cleanText(project.category, 120) || null,
        department: cleanText(project.department, 120) || null,
        contactos: contactsByProject.get(String(project.id))?.size ?? 0,
      }))
      .sort((left: any, right: any) => right.contactos - left.contactos)
      .slice(0, 3);

    if (!auth.ok) {
      return participantJson(200, {
        ok: true,
        authenticated: false,
        participant: null,
        affiliate: null,
        affiliate_status: "missing",
        top_projects: topProjects,
        my_projects: [],
        latest_threads: [],
      });
    }

    const affiliateResult = await resolveEntrepreneurAffiliate(
      supabase,
      auth.participant.id
    );

    if (!affiliateResult.ok) {
      return participantError(503, "entrepreneur_dashboard_unavailable");
    }

    const affiliate =
      affiliateResult.status === "verified"
        ? affiliateResult.affiliate
        : null;

    if (!affiliate) {
      return participantJson(200, {
        ok: true,
        authenticated: true,
        participant: auth.participant,
        affiliate: null,
        affiliate_status: affiliateResult.status,
        top_projects: topProjects,
        my_projects: [],
        latest_threads: [],
      });
    }

    const { data: ownProjects, error: ownProjectsError } = await supabase
      .from("espacio_proyectos")
      .select(
        "id,title,category,department,district,views,status,created_at"
      )
      .eq("owner_id", affiliate.id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (ownProjectsError) {
      console.error("[entrepreneur-dashboard] own projects lookup failed");
      return participantError(503, "entrepreneur_dashboard_unavailable");
    }

    const projectIds = (ownProjects ?? [])
      .map((project: any) => String(project.id ?? ""))
      .filter((id: string) => isEntrepreneurMessageUuid(id));

    let privateMessages: any[] = [];

    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from("espacio_mensajes")
        .select(
          "id,proyecto_id,sender_type,content,sender_participant_id,destinatario_participant_id,thread_key,leido,created_at"
        )
        .in("proyecto_id", projectIds)
        .neq("thread_key", "legacy-no-thread")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) {
        console.error("[entrepreneur-dashboard] private messages lookup failed");
        return participantError(503, "entrepreneur_dashboard_unavailable");
      }

      privateMessages = data ?? [];
    }

    const ownContacts = new Map<string, Set<string>>();
    const latestByThread = new Map<string, any>();

    for (const row of privateMessages) {
      const projectId = String(row?.proyecto_id ?? "");
      const senderType =
        row?.sender_type === "inversionista"
          ? "inversionista"
          : row?.sender_type === "emprendedor"
          ? "emprendedor"
          : null;

      if (!senderType) continue;

      const investorId =
        senderType === "inversionista"
          ? String(row?.sender_participant_id ?? "")
          : String(row?.destinatario_participant_id ?? "");

      const expectedThread = buildEntrepreneurMessageThreadKey(
        projectId,
        investorId
      );

      if (
        !expectedThread ||
        String(row?.thread_key ?? "") !== expectedThread
      ) {
        continue;
      }

      if (!ownContacts.has(projectId)) {
        ownContacts.set(projectId, new Set<string>());
      }
      ownContacts.get(projectId)!.add(investorId);

      if (!latestByThread.has(expectedThread)) {
        latestByThread.set(expectedThread, {
          id: String(row?.id ?? ""),
          proyecto_id: projectId,
          investor_id: investorId,
          content: messageContent(row?.content),
          created_at: row?.created_at ?? null,
          sender_type: senderType,
          thread_key: expectedThread,
          unread_count:
            senderType === "inversionista" && row?.leido !== true ? 1 : 0,
        });
      } else if (
        senderType === "inversionista" &&
        row?.leido !== true
      ) {
        latestByThread.get(expectedThread).unread_count += 1;
      }
    }

    const aliasesResult = await getParticipantAliasMap(
      supabase,
      Array.from(latestByThread.values()).map(
        (item: any) => item.investor_id
      )
    );

    if (!aliasesResult.ok) {
      return participantError(503, "entrepreneur_dashboard_unavailable");
    }

    const projectTitleById = new Map<string, string>();
    const myProjects = (ownProjects ?? []).map((project: any) => {
      const id = String(project.id);
      const title = cleanText(project.title, 300);
      projectTitleById.set(id, title);

      return {
        id,
        title,
        category: cleanText(project.category, 120) || null,
        department: cleanText(project.department, 120) || null,
        district: cleanText(project.district, 120) || null,
        views: Math.max(0, Math.trunc(Number(project.views ?? 0) || 0)),
        status: cleanText(project.status, 40),
        created_at: project.created_at ?? null,
        contactos: ownContacts.get(id)?.size ?? 0,
      };
    });

    const latestThreads = Array.from(latestByThread.values()).map(
      (thread: any) => ({
        ...thread,
        investor_alias:
          aliasesResult.aliases.get(thread.investor_id) ?? "Inversionista",
        proyecto_titulo:
          projectTitleById.get(thread.proyecto_id) ?? "Proyecto",
      })
    );

    return participantJson(200, {
      ok: true,
      authenticated: true,
      participant: auth.participant,
      affiliate,
      affiliate_status: affiliateResult.status,
      top_projects: topProjects,
      my_projects: myProjects,
      latest_threads: latestThreads,
    });
  } catch {
    console.error("[entrepreneur-dashboard] unexpected failure");
    return participantError(503, "entrepreneur_dashboard_unavailable");
  }
}