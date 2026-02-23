import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// POST /api/admin/session
// Body: { access_token, refresh_token }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const access_token = String(body?.access_token ?? "").trim();
    const refresh_token = String(body?.refresh_token ?? "").trim();

    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: "TOKENS_REQUIRED" }, { status: 400 });
    }

    // Respuesta que vamos a devolver (aquí se “pegan” cookies en setAll)
    const res = NextResponse.json({ ok: true }, { status: 200 });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          // NextRequest sí trae cookies.getAll()
          getAll() {
            return req.cookies.getAll();
          },
          // En Route Handler, seteamos cookies en la Response
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              res.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return NextResponse.json(
        { error: "SET_SESSION_FAILED", detail: error.message },
        { status: 401 }
      );
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: "EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}