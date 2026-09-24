import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminMutationOrigin } from "@/lib/adminMutationSecurity";

// POST /api/admin/logout
export async function POST(req: NextRequest) {
  try {
    if (!isAllowedAdminMutationOrigin(req)) {
      return NextResponse.json({ error: "REQUEST_INVALID" }, { status: 403 });
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              res.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    // Esto elimina cookies de sesión server-side
    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json(
        { error: "SIGNOUT_FAILED", detail: error.message },
        { status: 500 }
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