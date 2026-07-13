// src/app/api/vote/admin/rounds/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

const DEFAULT_GROUP_CODE = "GRUPOB";
const GROUP_RE = /^GRUPO[A-Z]$/;
const ROUND_SELECT = "id,name,is_active,created_at,group_code";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeGroupCode(value: unknown) {
  const group = String(value ?? "").trim().toUpperCase();
  if (!group) return DEFAULT_GROUP_CODE;
  return GROUP_RE.test(group) ? group : null;
}

function logAndHide(context: string, error: unknown) {
  console.error(`[vote/admin/rounds] ${context}`, error);
  return jsonError("No disponible.", 500);
}

async function requireAdmin(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

    if (!url || !anon || !adminEmail) {
      return { ok: false as const, error: "UNAUTHORIZED" as const, cookiesToSet: [] as any[] };
    }

    const cookiesToSet: any[] = [];

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(list) {
          cookiesToSet.push(...list);
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return { ok: false as const, error: "UNAUTHORIZED" as const, cookiesToSet };
    }

    const userEmail = (data.user.email ?? "").trim().toLowerCase();
    if (userEmail !== adminEmail) {
      return { ok: false as const, error: "FORBIDDEN" as const, cookiesToSet };
    }

    return { ok: true as const, cookiesToSet };
  } catch {
    return { ok: false as const, error: "UNAUTHORIZED" as const, cookiesToSet: [] as any[] };
  }
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Faltan variables de entorno de Supabase (URL o SERVICE_ROLE).");
  }

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return jsonError(gate.error, gate.error === "FORBIDDEN" ? 403 : 401);

  const groupCode = normalizeGroupCode(req.nextUrl.searchParams.get("group_code"));
  if (!groupCode) return jsonError("Solicitud invalida.", 400);

  try {
    const supabaseAdmin = getAdminSupabase();
    const { data, error } = await supabaseAdmin
      .from("vote_rounds")
      .select(ROUND_SELECT)
      .eq("group_code", groupCode)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return logAndHide("GET rounds failed", error);

    const res = NextResponse.json({
      ok: true,
      group_code: groupCode,
      rounds: data ?? [],
    });

    for (const { name, value, options } of gate.cookiesToSet) {
      res.cookies.set(name, value, options);
    }

    return res;
  } catch (e) {
    return logAndHide("GET unexpected error", e);
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return jsonError(gate.error, gate.error === "FORBIDDEN" ? 403 : 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Solicitud invalida.");
  }

  const name = String(body?.name ?? "").trim();
  const groupCode = normalizeGroupCode(body?.group_code);
  if (!name) return jsonError("Nombre requerido.");
  if (!groupCode) return jsonError("Solicitud invalida.", 400);

  try {
    const supabaseAdmin = getAdminSupabase();

    const { data: created, error: insErr } = await supabaseAdmin
      .from("vote_rounds")
      .insert({ name, is_active: true, group_code: groupCode })
      .select(ROUND_SELECT)
      .single();

    if (insErr) return logAndHide("POST insert failed", insErr);
    if (!created?.id) return jsonError("No se pudo crear la ronda.", 500);

    const { error: updErr } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: false })
      .eq("group_code", groupCode)
      .neq("id", created.id);

    if (updErr) return logAndHide("POST deactivate siblings failed", updErr);

    const res = NextResponse.json({ ok: true, round: created });

    for (const { name, value, options } of gate.cookiesToSet) {
      res.cookies.set(name, value, options);
    }

    return res;
  } catch (e) {
    return logAndHide("POST unexpected error", e);
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return jsonError(gate.error, gate.error === "FORBIDDEN" ? 403 : 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Solicitud invalida.");
  }

  const round_id = String(body?.round_id ?? "").trim();
  const groupCode = normalizeGroupCode(body?.group_code);
  if (!round_id) return jsonError("round_id es requerido.");
  if (!groupCode) return jsonError("Solicitud invalida.", 400);

  try {
    const supabaseAdmin = getAdminSupabase();

    const { data: activated, error: actErr } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: true })
      .eq("id", round_id)
      .eq("group_code", groupCode)
      .select(ROUND_SELECT)
      .maybeSingle();

    if (actErr) return logAndHide("PUT activate failed", actErr);
    if (!activated?.id) return jsonError("No disponible.", 404);

    const { error: updErr } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: false })
      .eq("group_code", groupCode)
      .neq("id", round_id);

    if (updErr) return logAndHide("PUT deactivate siblings failed", updErr);

    const res = NextResponse.json({ ok: true, round_id, round: activated });

    for (const { name, value, options } of gate.cookiesToSet) {
      res.cookies.set(name, value, options);
    }

    return res;
  } catch (e) {
    return logAndHide("PUT unexpected error", e);
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return jsonError(gate.error, gate.error === "FORBIDDEN" ? 403 : 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Solicitud invalida.");
  }

  const round_id = String(body?.round_id ?? "").trim();
  const groupCode = normalizeGroupCode(body?.group_code);
  if (!round_id) return jsonError("round_id es requerido.");
  if (!groupCode) return jsonError("Solicitud invalida.", 400);

  try {
    const supabaseAdmin = getAdminSupabase();

    const { data: closed, error } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: false })
      .eq("id", round_id)
      .eq("group_code", groupCode)
      .select(ROUND_SELECT)
      .maybeSingle();

    if (error) return logAndHide("PATCH close failed", error);
    if (!closed?.id) return jsonError("No disponible.", 404);

    const res = NextResponse.json({ ok: true, round_id, round: closed, closed: true });

    for (const { name, value, options } of gate.cookiesToSet) {
      res.cookies.set(name, value, options);
    }

    return res;
  } catch (e) {
    return logAndHide("PATCH unexpected error", e);
  }
}
