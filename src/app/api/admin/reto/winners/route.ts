// src/app/api/admin/reto/winners/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
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

    const cookiesToSet: any[] = [];

    const supabase = createServerClient(url, anon, {
      cookies: {
        // ✅ Route Handlers: usar req.cookies.getAll()
        getAll() {
          return req.cookies.getAll();
        },
        // ✅ Capturar cookies que Supabase quiera refrescar
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

// GET /api/admin/reto/winners?group=GRUPOA&status=pendiente
export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const group = (searchParams.get("group") ?? "").trim();
    const status = (searchParams.get("status") ?? "").trim();

    const supabase = supabaseAdmin();

    let q = supabase
      .from("reto_premio_winners")
      .select(
        "id, created_at, group_code, dni, celular, email, device_id, prize_segment, prize_note, year_month, status"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (group && group !== "Todos") q = q.eq("group_code", group);
    if (status && status !== "Todos") q = q.eq("status", status);

    const { data, error } = await q;

    if (error) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: error.message },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ winners: data ?? [] }, { status: 200 });

    // ✅ Aplicar cookies refrescadas (si hubo)
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

// PATCH /api/admin/reto/winners body: { id, status }
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String((body as any)?.id ?? "").trim();
    const status = String((body as any)?.status ?? "").trim();

    const allowed = ["pendiente", "contactado", "entregado", "anulado"];

    if (!id) {
      return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
    }

    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "STATUS_INVALID" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("reto_premio_winners")
      .update({ status })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const res = NextResponse.json({ ok: true, row: data }, { status: 200 });

    // ✅ Aplicar cookies refrescadas (si hubo)
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