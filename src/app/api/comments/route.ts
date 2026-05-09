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
  if (!serviceKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SERVICE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function safeMetadata(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const input = raw as Record<string, unknown>;

  return {
    source_module: cleanText(input.source_module, 80),
    source_section: cleanText(input.source_section, 80),
    source_action: cleanText(input.source_action, 80),
    page_title: cleanText(input.page_title, 120),
    route: cleanText(input.route, 200),
    topic_id: cleanText(input.topic_id, 120),
    topic_title: cleanText(input.topic_title, 160),
    user_alias: cleanText(input.user_alias, 80),
    device_label: cleanText(input.device_label, 80),
    submitted_from: cleanText(input.submitted_from, 80),
    client_timestamp: cleanText(input.client_timestamp, 80),
  };
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    const cookieHeader = req.headers.get("cookie");
    const group = getCookieValue(cookieHeader, "vc_group") ?? "";

    if (!group) {
      return json(401, {
        ok: false,
        error: "vc_group cookie not found",
      });
    }

    const payload = await req.json().catch(() => ({}));

    const message = cleanText(payload?.message, 2000);
    const device_id = cleanText(payload?.device_id, 120) || null;
    const page = cleanText(payload?.page, 200) || null;
    const metadata = safeMetadata(payload?.metadata);

    if (!message || message.length < 3) {
      return json(400, {
        ok: false,
        error: "message requerido, mínimo 3 caracteres",
      });
    }

    if (message.length > 2000) {
      return json(400, {
        ok: false,
        error: "message demasiado largo, máximo 2000 caracteres",
      });
    }

    const { data, error } = await supabase
      .from("user_comments")
      .insert({
        group_code: group,
        device_id,
        page,
        message,
        status: "new",
        metadata,
      })
      .select("id, created_at, group_code, status, metadata")
      .maybeSingle();

    if (error) {
      return json(500, {
        ok: false,
        error: "Error insertando comentario",
        detail: error.message,
      });
    }

    return json(200, {
      ok: true,
      comment: data,
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      error: "Error interno",
      detail: e?.message ?? String(e),
    });
  }
}