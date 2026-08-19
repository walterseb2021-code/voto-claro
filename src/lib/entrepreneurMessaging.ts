import "server-only";

import { resolveEntrepreneurAffiliate } from "@/lib/entrepreneurProject";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ENTREPRENEUR_MESSAGE_MAX_CHARS = 2000;
export const ENTREPRENEUR_MESSAGE_MAX_PER_HOUR = 60;

type AdminClient = any;

export type EntrepreneurProjectRecord = {
  id: string;
  title: string;
  category: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  summary: string | null;
  investment_min: number | null;
  investment_max: number | null;
  pdf_url: string | null;
  status: string;
  views: number;
  created_at: string | null;
  owner_alias: string;
  owner_affiliate_id: string | null;
  owner_participant_id: string | null;
  owner_active: boolean;
};

export function isEntrepreneurMessageUuid(value: unknown) {
  return UUID_RE.test(String(value ?? "").trim());
}

export function cleanEntrepreneurMessageContent(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (
    normalized.length < 1 ||
    normalized.length > ENTREPRENEUR_MESSAGE_MAX_CHARS ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function buildEntrepreneurMessageThreadKey(
  projectId: string,
  investorParticipantId: string
) {
  if (
    !isEntrepreneurMessageUuid(projectId) ||
    !isEntrepreneurMessageUuid(investorParticipantId)
  ) {
    return null;
  }

  return `${projectId}::${investorParticipantId}`;
}

function safeString(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeNullableString(value: unknown, maxLength: number) {
  const clean = safeString(value, maxLength);
  return clean || null;
}

function safeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeCount(value: unknown) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.trunc(number);
}

function publicAlias(value: unknown, fallback: string) {
  const alias = safeString(value, 80);
  return alias || fallback;
}

export async function getEntrepreneurProjectRecord(
  supabase: AdminClient,
  projectId: string
): Promise<
  | { ok: true; project: EntrepreneurProjectRecord | null }
  | { ok: false; reason: "unavailable" }
> {
  if (!isEntrepreneurMessageUuid(projectId)) {
    return { ok: true, project: null };
  }

  const { data: project, error: projectError } = await supabase
    .from("espacio_proyectos")
    .select(
      "id,owner_id,title,category,department,province,district,summary,investment_min,investment_max,pdf_url,status,views,created_at"
    )
    .eq("id", projectId)
    .limit(1)
    .maybeSingle();

  if (projectError) {
    console.error("[entrepreneur-messaging] project lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!project?.id) {
    return { ok: true, project: null };
  }

  const ownerAffiliateId = isEntrepreneurMessageUuid(project.owner_id)
    ? String(project.owner_id)
    : null;

  let ownerParticipantId: string | null = null;
  let ownerActive = false;
  let ownerAlias = "Emprendedor";

  if (ownerAffiliateId) {
    const { data: affiliate, error: affiliateError } = await supabase
      .from("espacio_afiliados")
      .select("id,participant_id")
      .eq("id", ownerAffiliateId)
      .limit(1)
      .maybeSingle();

    if (affiliateError) {
      console.error("[entrepreneur-messaging] owner affiliate lookup failed");
      return { ok: false, reason: "unavailable" };
    }

    ownerParticipantId = isEntrepreneurMessageUuid(affiliate?.participant_id)
      ? String(affiliate.participant_id)
      : null;

    if (ownerParticipantId) {
      const ownerIdentity = await resolveEntrepreneurAffiliate(
        supabase,
        ownerParticipantId
      );

      if (!ownerIdentity.ok) {
        console.error(
          "[entrepreneur-messaging] owner identity verification unavailable"
        );
        return { ok: false, reason: "unavailable" };
      }

      const verifiedOwner =
        ownerIdentity.status === "verified" &&
        ownerIdentity.affiliate?.id === ownerAffiliateId;

      if (verifiedOwner) {
        ownerActive = true;

        const { data: participant, error: participantError } = await supabase
          .from("project_participants")
          .select("id,alias")
          .eq("id", ownerParticipantId)
          .limit(1)
          .maybeSingle();

        if (participantError) {
          console.error("[entrepreneur-messaging] owner alias lookup failed");
          return { ok: false, reason: "unavailable" };
        }

        ownerAlias = publicAlias(participant?.alias, "Emprendedor");
      }
    }
  }

  return {
    ok: true,
    project: {
      id: String(project.id),
      title: safeString(project.title, 300),
      category: safeNullableString(project.category, 120),
      department: safeNullableString(project.department, 120),
      province: safeNullableString(project.province, 120),
      district: safeNullableString(project.district, 120),
      summary: safeNullableString(project.summary, 5000),
      investment_min: safeNullableNumber(project.investment_min),
      investment_max: safeNullableNumber(project.investment_max),
      pdf_url: safeNullableString(project.pdf_url, 2048),
      status: safeString(project.status, 40),
      views: safeCount(project.views),
      created_at: safeNullableString(project.created_at, 80),
      owner_alias: ownerAlias,
      owner_affiliate_id: ownerAffiliateId,
      owner_participant_id: ownerParticipantId,
      owner_active: ownerActive,
    },
  };
}

export async function resolveEntrepreneurProjectViewer(
  supabase: AdminClient,
  participantId: string,
  ownerAffiliateId: string | null
) {
  const affiliateResult = await resolveEntrepreneurAffiliate(
    supabase,
    participantId
  );

  if (!affiliateResult.ok) {
    return { ok: false as const, reason: "unavailable" as const };
  }

  const verifiedAffiliate =
    affiliateResult.status === "verified"
      ? affiliateResult.affiliate
      : null;

  const isOwner =
    Boolean(verifiedAffiliate?.id) &&
    Boolean(ownerAffiliateId) &&
    verifiedAffiliate!.id === ownerAffiliateId;

  return {
    ok: true as const,
    affiliateStatus: affiliateResult.status,
    affiliate: verifiedAffiliate,
    isOwner,
  };
}

export async function getParticipantAliasMap(
  supabase: AdminClient,
  participantIds: string[]
) {
  const ids = Array.from(
    new Set(
      participantIds
        .map((value) => String(value ?? "").trim())
        .filter((value) => isEntrepreneurMessageUuid(value))
    )
  );

  const aliases = new Map<string, string>();
  if (ids.length === 0) return { ok: true as const, aliases };

  const { data, error } = await supabase
    .from("project_participants")
    .select("id,alias")
    .in("id", ids);

  if (error) {
    console.error("[entrepreneur-messaging] participant alias batch failed");
    return { ok: false as const };
  }

  for (const row of data ?? []) {
    const id = String(row?.id ?? "");
    if (!isEntrepreneurMessageUuid(id)) continue;
    aliases.set(id, publicAlias(row?.alias, "Inversionista"));
  }

  return { ok: true as const, aliases };
}

export async function loadEntrepreneurMessageThread(
  supabase: AdminClient,
  projectId: string,
  investorParticipantId: string
) {
  const threadKey = buildEntrepreneurMessageThreadKey(
    projectId,
    investorParticipantId
  );

  if (!threadKey) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const { data, error } = await supabase
    .from("espacio_mensajes")
    .select(
      "id,sender_type,content,sender_afiliado_id,sender_participant_id,destinatario_participant_id,destinatario_afiliado_id,thread_key,leido,created_at"
    )
    .eq("proyecto_id", projectId)
    .eq("thread_key", threadKey)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[entrepreneur-messaging] thread lookup failed");
    return { ok: false as const, reason: "unavailable" as const };
  }

  const messages = (data ?? []).flatMap((row: any) => {
    const senderType =
      row?.sender_type === "inversionista"
        ? "inversionista"
        : row?.sender_type === "emprendedor"
        ? "emprendedor"
        : null;

    const id = String(row?.id ?? "");
    const content = cleanEntrepreneurMessageContent(row?.content);

    if (!senderType || !isEntrepreneurMessageUuid(id) || !content) {
      return [];
    }

    return [
      {
        id,
        sender_type: senderType,
        content,
        leido: row?.leido === true,
        created_at: safeNullableString(row?.created_at, 80),
      },
    ];
  });

  return {
    ok: true as const,
    threadKey,
    messages,
  };
}

export async function loadEntrepreneurOwnerThreadSummaries(
  supabase: AdminClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from("espacio_mensajes")
    .select(
      "id,proyecto_id,sender_type,content,sender_participant_id,destinatario_participant_id,thread_key,leido,created_at"
    )
    .eq("proyecto_id", projectId)
    .neq("thread_key", "legacy-no-thread")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[entrepreneur-messaging] owner thread list failed");
    return { ok: false as const, reason: "unavailable" as const };
  }

  const latest = new Map<
    string,
    {
      id: string;
      investorId: string;
      content: string;
      createdAt: string | null;
      senderType: "inversionista" | "emprendedor";
      unreadCount: number;
      threadKey: string;
    }
  >();

  for (const row of data ?? []) {
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

    const threadKey = String(row?.thread_key ?? "");
    const expectedKey = buildEntrepreneurMessageThreadKey(projectId, investorId);
    const messageId = String(row?.id ?? "");
    const content = cleanEntrepreneurMessageContent(row?.content);

    if (
      !expectedKey ||
      threadKey !== expectedKey ||
      !isEntrepreneurMessageUuid(messageId) ||
      !content
    ) {
      continue;
    }

    const existing = latest.get(threadKey);

    if (!existing) {
      latest.set(threadKey, {
        id: messageId,
        investorId,
        content,
        createdAt: safeNullableString(row?.created_at, 80),
        senderType,
        unreadCount:
          senderType === "inversionista" && row?.leido !== true ? 1 : 0,
        threadKey,
      });
    } else if (
      senderType === "inversionista" &&
      row?.leido !== true
    ) {
      existing.unreadCount += 1;
    }
  }

  const investorIds = Array.from(latest.values()).map(
    (item) => item.investorId
  );

  const aliasResult = await getParticipantAliasMap(supabase, investorIds);
  if (!aliasResult.ok) {
    return { ok: false as const, reason: "unavailable" as const };
  }

  const threads = Array.from(latest.values()).map((item) => ({
    id: item.id,
    investor_id: item.investorId,
    investor_alias:
      aliasResult.aliases.get(item.investorId) ?? "Inversionista",
    content: item.content,
    created_at: item.createdAt,
    sender_type: item.senderType,
    thread_key: item.threadKey,
    unread_count: item.unreadCount,
  }));

  return { ok: true as const, threads };
}