// src/app/api/admin/tokens/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
}

async function requireAdmin(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

    if (!url || !anon || !adminEmail) {
      return { ok: false as const, cookiesToSet: [] as any[] };
    }

    // Guardamos cookies que Supabase quiera “refrescar” (si aplica)
    const cookiesToSet: any[] = [];

    const supabase = createServerClient(url, anon, {
      cookies: {
        // ✅ En Route Handlers: usamos req.cookies.getAll()
        getAll() {
          return req.cookies.getAll();
        },
        // ✅ Capturamos cookies para aplicarlas al response final
        setAll(list) {
          cookiesToSet.push(...list);
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return { ok: false as const, cookiesToSet };

    const userEmail = (data.user.email ?? "").trim().toLowerCase();
    if (userEmail !== adminEmail) return { ok: false as const, cookiesToSet };

    return { ok: true as const, cookiesToSet };
  } catch {
    return { ok: false as const, cookiesToSet: [] as any[] };
  }
}

/**
 * GET /api/admin/tokens
 * - lista tokens de /pitch
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("votoclaro_public_links")
      .select("id, token, route, is_active, expires_at, note, created_at")
      .eq("route", "/pitch")
      .order("token", { ascending: true })
      .limit(2000);

    if (error) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: error.message },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ tokens: data ?? [] }, { status: 200 });

    // ✅ Aplicar cookies (si Supabase intentó refrescar)
    for (const { name, value, options } of gate.cookiesToSet) {
      res.cookies.set(name, value, options);
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: "EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/tokens
 * body: { id: string, is_active?: boolean, expires_at?: string|null, note?: string|null }
 */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String((body as any)?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });

    const patch: any = {};
    if (typeof (body as any).is_active === "boolean") patch.is_active = (body as any).is_active;
    if ((body as any).expires_at === null) patch.expires_at = null;
    if (typeof (body as any).expires_at === "string") patch.expires_at = (body as any).expires_at;
    if ((body as any).note === null) patch.note = null;
    if (typeof (body as any).note === "string") patch.note = (body as any).note;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "NO_FIELDS" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("votoclaro_public_links")
      .update(patch)
      .eq("id", id)
      .select("id, token, route, is_active, expires_at, note, created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: error.message },
        { status: 500 }
      );
    }

    if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const res = NextResponse.json({ ok: true, token: data }, { status: 200 });

    // ✅ Aplicar cookies (si Supabase intentó refrescar)
    for (const { name, value, options } of gate.cookiesToSet) {
      res.cookies.set(name, value, options);
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: "EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}