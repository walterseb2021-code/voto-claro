import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VC_PITCH_COOKIE = "vc_pitch_token";
const VC_GROUP_COOKIE = "vc_group";

function tokenToGroup(token: string) {
  // GRUPOA-2026-01 -> GRUPOA
  const m = token.match(/^(GRUPO[A-Z])-/);
  return m ? m[1] : null;
}

function getSupabaseAdmin() {
  // ✅ IMPORTANTÍSIMO: en tu .env.local tienes NEXT_PUBLIC_SUPABASE_URL, NO SUPABASE_URL
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String((body as any)?.token ?? "").trim();

    if (!token) {
      return NextResponse.json({ error: "TOKEN_REQUIRED" }, { status: 400 });
    }

    const group = tokenToGroup(token);
    if (!group) {
      return NextResponse.json({ error: "TOKEN_GROUP_PARSE_FAILED" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("votoclaro_public_links")
      .select("token, route, is_active, expires_at")
      .eq("token", token)
      .eq("route", "/pitch")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "TOKEN_INVALID_OR_INACTIVE" }, { status: 401 });
    }

    if (data.expires_at) {
      const exp = new Date(String(data.expires_at)).getTime();
      if (Number.isFinite(exp) && Date.now() > exp) {
        return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
      }
    }

    const res = NextResponse.json({ ok: true, group }, { status: 200 });

    // ✅ Cookie HttpOnly: gate fuerte para middleware
    res.cookies.set(VC_PITCH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });

    // ✅ Cookie grupo para filtrar Supabase luego
    res.cookies.set(VC_GROUP_COOKIE, group, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return res;
  } catch (e: any) {
    // ✅ devolvemos error real (para debug)
    return NextResponse.json(
      { error: "GATE_EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
