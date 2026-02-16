// src/app/api/vote/admin/rounds/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function requireAdminKey(req: Request) {
  const expected = process.env.VC_ADMIN_KEY || "";
  const got = req.headers.get("x-vc-admin-key") || "";
  if (!expected) return { ok: false, error: "Falta VC_ADMIN_KEY en variables de entorno." as const };
  if (!got || got !== expected) return { ok: false, error: "No autorizado." as const };
  return { ok: true as const };
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Faltan variables de entorno de Supabase (URL o SERVICE_ROLE).");
  }
  return createClient(url, serviceKey);
}

/**
 * GET: lista rondas (interno admin)
 * POST: crea nueva ronda y la deja ACTIVA (desactiva las demás)
 * PUT: activa una ronda existente (desactiva las demás)
 * PATCH: cierra la ronda (is_active=false) sin borrar historial
 */
export async function GET(req: Request) {
  const gate = requireAdminKey(req);
  if (!gate.ok) return jsonError(gate.error, 401);

  try {
    const supabaseAdmin = getAdminSupabase();
    const { data, error } = await supabaseAdmin
      .from("vote_rounds")
      .select("id,name,is_active,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return jsonError(`Supabase error: ${error.message}`, 500);

    return NextResponse.json({ ok: true, rounds: data ?? [] });
  } catch (e: any) {
    return jsonError(e?.message ?? "Error interno.", 500);
  }
}

export async function POST(req: Request) {
  const gate = requireAdminKey(req);
  if (!gate.ok) return jsonError(gate.error, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Body JSON inválido.");
  }

  const name = String(body?.name ?? "").trim();
  if (!name) return jsonError("name es requerido.");

  try {
    const supabaseAdmin = getAdminSupabase();

    // 1) Crear nueva ronda activa
    const { data: created, error: insErr } = await supabaseAdmin
      .from("vote_rounds")
      .insert({ name, is_active: true })
      .select("id,name,is_active,created_at")
      .single();

    if (insErr) return jsonError(`Supabase error: ${insErr.message}`, 500);
    if (!created?.id) return jsonError("No se pudo crear la ronda.", 500);

    // 2) Desactivar todas las demás
    const { error: updErr } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: false })
      .neq("id", created.id);

    if (updErr) return jsonError(`Supabase error: ${updErr.message}`, 500);

    return NextResponse.json({ ok: true, round: created });
  } catch (e: any) {
    return jsonError(e?.message ?? "Error interno.", 500);
  }
}

export async function PUT(req: Request) {
  const gate = requireAdminKey(req);
  if (!gate.ok) return jsonError(gate.error, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Body JSON inválido.");
  }

  const round_id = String(body?.round_id ?? "").trim();
  if (!round_id) return jsonError("round_id es requerido.");

  try {
    const supabaseAdmin = getAdminSupabase();

    // 1) Activar esta ronda
    const { error: actErr } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: true })
      .eq("id", round_id);

    if (actErr) return jsonError(`Supabase error: ${actErr.message}`, 500);

    // 2) Desactivar las demás
    const { error: updErr } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: false })
      .neq("id", round_id);

    if (updErr) return jsonError(`Supabase error: ${updErr.message}`, 500);

    return NextResponse.json({ ok: true, round_id });
  } catch (e: any) {
    return jsonError(e?.message ?? "Error interno.", 500);
  }
}

export async function PATCH(req: Request) {
  const gate = requireAdminKey(req);
  if (!gate.ok) return jsonError(gate.error, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Body JSON inválido.");
  }

  const round_id = String(body?.round_id ?? "").trim();
  if (!round_id) return jsonError("round_id es requerido.");

  try {
    const supabaseAdmin = getAdminSupabase();

    // “Cerrar” = dejarla inactiva (sin borrar historial)
    const { error } = await supabaseAdmin
      .from("vote_rounds")
      .update({ is_active: false })
      .eq("id", round_id);

    if (error) return jsonError(`Supabase error: ${error.message}`, 500);

    return NextResponse.json({ ok: true, round_id, closed: true });
  } catch (e: any) {
    return jsonError(e?.message ?? "Error interno.", 500);
  }
}
