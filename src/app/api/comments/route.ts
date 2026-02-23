// src/app/api/comments/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_KEY)");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    // ✅ group_code desde cookie vc_group (mismo patrón que voto)
    const cookieHeader = req.headers.get("cookie");
    const group = getCookieValue(cookieHeader, "vc_group") ?? "";
    if (!group) return json(401, { error: "vc_group cookie not found" });

    const payload = await req.json();
    const message = (payload?.message ?? "").toString().trim();
    const device_id = (payload?.device_id ?? "").toString().trim() || null;
    const page = (payload?.page ?? "").toString().trim() || null;

    if (!message || message.length < 3) {
      return json(400, { error: "message requerido (min 3 caracteres)" });
    }
    if (message.length > 2000) {
      return json(400, { error: "message demasiado largo (max 2000)" });
    }

    const { data, error } = await supabase
      .from("user_comments")
      .insert({
        group_code: group,
        device_id,
        page,
        message,
        status: "new",
      })
      .select("id,created_at,group_code,status")
      .maybeSingle();

    if (error) return json(500, { error: "Error insertando comentario", detail: error.message });

    return json(200, { ok: true, comment: data });
  } catch (e: any) {
    return json(500, { error: "Error interno", detail: e?.message ?? String(e) });
  }
}