import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, type AdminAuthResult } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie, Origin",
};

type AffiliateRow = {
  id: string;
  participant_id: string | null;
  dni: string;
  verified_at: string | null;
  is_active: boolean | null;
  created_at: string | null;
  nombres_completos?: string | null;
  email?: string | null;
  participante?:
    | { full_name?: string | null; email?: string | null }
    | Array<{ full_name?: string | null; email?: string | null }>
    | null;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function withAuthCookies(response: NextResponse, gate: AdminAuthResult) {
  for (const cookie of gate.cookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

function respond(
  gate: AdminAuthResult,
  status: number,
  body: Record<string, unknown>
) {
  return withAuthCookies(json(status, body), gate);
}

function getAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Admin affiliate dependency unavailable.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isAllowedMutationOrigin(req: NextRequest) {
  const rawOrigin = req.headers.get("origin");
  if (!rawOrigin) return false;

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return false;
  }

  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    return false;
  }

  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host");

  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.nextUrl.protocol.replace(":", "");

  if (host && origin.origin === `${proto}://${host}`) {
    return true;
  }

  return origin.origin === req.nextUrl.origin;
}

async function readJsonObject(req: NextRequest, maxBytes = 2048) {
  const contentType =
    req.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    if (
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      parsed > maxBytes
    ) {
      return null;
    }
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return null;
  }

  try {
    const value = JSON.parse(raw);
    return value &&
      typeof value === "object" &&
      !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeDni(value: unknown) {
  const dni = String(value ?? "").trim();
  return /^\d{8}$/.test(dni) ? dni : null;
}

function normalizeSearchDni(value: unknown) {
  const dni = String(value ?? "").trim();
  if (!dni) return "";
  return /^\d{1,8}$/.test(dni) ? dni : null;
}

function isUuid(value: unknown) {
  return UUID_RE.test(String(value ?? "").trim());
}

function normalizeAffiliate(row: AffiliateRow) {
  const relation = Array.isArray(row.participante)
    ? row.participante[0] ?? null
    : row.participante ?? null;

  const name =
    String(relation?.full_name ?? "").trim() ||
    String(row.nombres_completos ?? "").trim() ||
    null;

  const email =
    String(relation?.email ?? "").trim() ||
    String(row.email ?? "").trim() ||
    null;

  return {
    id: String(row.id),
    participant_id: row.participant_id
      ? String(row.participant_id)
      : null,
    dni: String(row.dni),
    verified_at:
      typeof row.verified_at === "string"
        ? row.verified_at
        : null,
    is_active: row.is_active === true,
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : null,
    participant_name: name,
    participant_email: email,
    participant_linked: isUuid(row.participant_id),
  };
}

const AFFILIATE_SELECT = `
  id,
  participant_id,
  dni,
  verified_at,
  is_active,
  created_at,
  nombres_completos,
  email,
  participante:project_participants!participant_id (
    full_name,
    email
  )
`;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);

  if (!gate.ok) {
    return respond(gate, gate.status, {
      ok: false,
      error: gate.error,
    });
  }

  const search = normalizeSearchDni(
    req.nextUrl.searchParams.get("dni")
  );

  if (search === null) {
    return respond(gate, 400, {
      ok: false,
      error: "DNI_DE_BUSQUEDA_INVALIDO",
    });
  }

  try {
    const admin = getAdminClient();

    let query = admin
      .from("espacio_afiliados")
      .select(AFFILIATE_SELECT)
      .order("created_at", { ascending: false })
      .limit(250);

    if (search) {
      query = query.ilike("dni", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        "[admin-afiliados] list failed",
        error.message
      );

      return respond(gate, 503, {
        ok: false,
        error: "NO_DISPONIBLE",
      });
    }

    return respond(gate, 200, {
      ok: true,
      afiliados: (data ?? []).map((row) =>
        normalizeAffiliate(row as AffiliateRow)
      ),
    });
  } catch {
    console.error("[admin-afiliados] list unavailable");

    return respond(gate, 503, {
      ok: false,
      error: "NO_DISPONIBLE",
    });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);

  if (!gate.ok) {
    return respond(gate, gate.status, {
      ok: false,
      error: gate.error,
    });
  }

  if (!isAllowedMutationOrigin(req)) {
    return respond(gate, 403, {
      ok: false,
      error: "ORIGIN_NO_AUTORIZADO",
    });
  }

  const body = await readJsonObject(req);
  if (!body || Object.keys(body).some((key) => key !== "dni")) {
    return respond(gate, 400, {
      ok: false,
      error: "SOLICITUD_INVALIDA",
    });
  }

  const dni = normalizeDni(body.dni);
  if (!dni) {
    return respond(gate, 400, {
      ok: false,
      error: "DNI_INVALIDO",
    });
  }

  try {
    const admin = getAdminClient();

    const {
      data: participant,
      error: participantError,
    } = await admin
      .from("project_participants")
      .select("id,dni,full_name,email")
      .eq("dni", dni)
      .limit(1)
      .maybeSingle();

    if (participantError) {
      console.error(
        "[admin-afiliados] participant lookup failed",
        participantError.message
      );

      return respond(gate, 503, {
        ok: false,
        error: "NO_DISPONIBLE",
      });
    }

    if (!participant?.id || !isUuid(participant.id)) {
      return respond(gate, 404, {
        ok: false,
        error: "PARTICIPANTE_NO_ENCONTRADO",
      });
    }

    const participantDni = normalizeDni(participant.dni);
    if (participantDni !== dni) {
      return respond(gate, 409, {
        ok: false,
        error: "IDENTIDAD_INCONSISTENTE",
      });
    }

    const {
      data: existingRows,
      error: existingError,
    } = await admin
      .from("espacio_afiliados")
      .select(
        "id,participant_id,dni,is_active,verified_at,created_at"
      )
      .or(`participant_id.eq.${participant.id},dni.eq.${dni}`)
      .limit(2);

    if (existingError) {
      console.error(
        "[admin-afiliados] existing lookup failed",
        existingError.message
      );

      return respond(gate, 503, {
        ok: false,
        error: "NO_DISPONIBLE",
      });
    }

    if ((existingRows?.length ?? 0) > 1) {
      return respond(gate, 409, {
        ok: false,
        error: "AFILIACION_AMBIGUA",
      });
    }

    const existing = existingRows?.[0] ?? null;

    if (existing) {
      const existingParticipantId = String(
        existing.participant_id ?? ""
      ).trim();

      if (!isUuid(existingParticipantId)) {
        return respond(gate, 409, {
          ok: false,
          error: "AFILIACION_LEGACY_REQUIERE_REVISION",
        });
      }

      if (existingParticipantId !== String(participant.id)) {
        return respond(gate, 409, {
          ok: false,
          error: "DNI_ASOCIADO_A_OTRA_AFILIACION",
        });
      }

      if (normalizeDni(existing.dni) !== dni) {
        return respond(gate, 409, {
          ok: false,
          error: "IDENTIDAD_INCONSISTENTE",
        });
      }

      if (existing.is_active === true) {
        return respond(gate, 409, {
          ok: false,
          error: "AFILIADO_YA_ACTIVO",
        });
      }

      const { data: reactivated, error: reactivateError } =
        await admin
          .from("espacio_afiliados")
          .update({
            is_active: true,
            verified_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select(AFFILIATE_SELECT)
          .maybeSingle();

      if (reactivateError || !reactivated) {
        console.error(
          "[admin-afiliados] reactivate failed",
          reactivateError?.message ?? "missing row"
        );

        return respond(gate, 503, {
          ok: false,
          error: "NO_DISPONIBLE",
        });
      }

      return respond(gate, 200, {
        ok: true,
        action: "reactivated",
        afiliado: normalizeAffiliate(
          reactivated as AffiliateRow
        ),
      });
    }

    const now = new Date().toISOString();

    const { data: inserted, error: insertError } =
      await admin
        .from("espacio_afiliados")
        .insert({
          participant_id: participant.id,
          dni,
          verified_at: now,
          is_active: true,
        })
        .select(AFFILIATE_SELECT)
        .maybeSingle();

    if (insertError || !inserted) {
      console.error(
        "[admin-afiliados] insert failed",
        insertError?.message ?? "missing row"
      );

      return respond(gate, 503, {
        ok: false,
        error: "NO_DISPONIBLE",
      });
    }

    return respond(gate, 201, {
      ok: true,
      action: "created",
      afiliado: normalizeAffiliate(inserted as AffiliateRow),
    });
  } catch {
    console.error("[admin-afiliados] create unavailable");

    return respond(gate, 503, {
      ok: false,
      error: "NO_DISPONIBLE",
    });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);

  if (!gate.ok) {
    return respond(gate, gate.status, {
      ok: false,
      error: gate.error,
    });
  }

  if (!isAllowedMutationOrigin(req)) {
    return respond(gate, 403, {
      ok: false,
      error: "ORIGIN_NO_AUTORIZADO",
    });
  }

  const body = await readJsonObject(req);

  if (
    !body ||
    Object.keys(body).some(
      (key) => key !== "id" && key !== "is_active"
    )
  ) {
    return respond(gate, 400, {
      ok: false,
      error: "SOLICITUD_INVALIDA",
    });
  }

  const id = String(body.id ?? "").trim();
  const targetActive = body.is_active;

  if (!isUuid(id) || typeof targetActive !== "boolean") {
    return respond(gate, 400, {
      ok: false,
      error: "SOLICITUD_INVALIDA",
    });
  }

  try {
    const admin = getAdminClient();

    const { data: current, error: currentError } =
      await admin
        .from("espacio_afiliados")
        .select(
          "id,participant_id,dni,is_active,verified_at,created_at"
        )
        .eq("id", id)
        .limit(1)
        .maybeSingle();

    if (currentError) {
      console.error(
        "[admin-afiliados] status lookup failed",
        currentError.message
      );

      return respond(gate, 503, {
        ok: false,
        error: "NO_DISPONIBLE",
      });
    }

    if (!current) {
      return respond(gate, 404, {
        ok: false,
        error: "AFILIADO_NO_ENCONTRADO",
      });
    }

    if ((current.is_active === true) === targetActive) {
      return respond(gate, 200, {
        ok: true,
        action: targetActive
          ? "already_active"
          : "already_inactive",
      });
    }

    const updatePayload: {
      is_active: boolean;
      verified_at?: string;
    } = {
      is_active: targetActive,
    };

    if (targetActive) {
      const participantId = String(
        current.participant_id ?? ""
      ).trim();

      if (!isUuid(participantId)) {
        return respond(gate, 409, {
          ok: false,
          error: "AFILIACION_LEGACY_REQUIERE_REVISION",
        });
      }

      const { data: participant, error: participantError } =
        await admin
          .from("project_participants")
          .select("id,dni")
          .eq("id", participantId)
          .limit(1)
          .maybeSingle();

      if (participantError) {
        console.error(
          "[admin-afiliados] reactivation identity lookup failed",
          participantError.message
        );

        return respond(gate, 503, {
          ok: false,
          error: "NO_DISPONIBLE",
        });
      }

      const currentDni = normalizeDni(current.dni);
      const participantDni = normalizeDni(participant?.dni);

      if (
        !participant?.id ||
        currentDni === null ||
        participantDni === null ||
        currentDni !== participantDni
      ) {
        return respond(gate, 409, {
          ok: false,
          error: "IDENTIDAD_INCONSISTENTE",
        });
      }

      updatePayload.verified_at =
        new Date().toISOString();
    }

    const { data: updated, error: updateError } =
      await admin
        .from("espacio_afiliados")
        .update(updatePayload)
        .eq("id", id)
        .select(AFFILIATE_SELECT)
        .maybeSingle();

    if (updateError || !updated) {
      console.error(
        "[admin-afiliados] status update failed",
        updateError?.message ?? "missing row"
      );

      return respond(gate, 503, {
        ok: false,
        error: "NO_DISPONIBLE",
      });
    }

    return respond(gate, 200, {
      ok: true,
      action: targetActive
        ? "reactivated"
        : "deactivated",
      afiliado: normalizeAffiliate(updated as AffiliateRow),
    });
  } catch {
    console.error("[admin-afiliados] status unavailable");

    return respond(gate, 503, {
      ok: false,
      error: "NO_DISPONIBLE",
    });
  }
}