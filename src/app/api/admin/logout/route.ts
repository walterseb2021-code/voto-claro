import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminMutationOrigin } from "@/lib/adminMutationSecurity";

const ADMIN_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
} as const;

function adminJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(ADMIN_NO_STORE_HEADERS)) {
    headers.set(name, value);
  }
  return NextResponse.json(body, { ...init, headers });
}

// POST /api/admin/logout
export async function POST(req: NextRequest) {
  try {
    if (!isAllowedAdminMutationOrigin(req)) {
      return adminJson({ error: "REQUEST_INVALID" }, { status: 403 });
    }

    const res = adminJson({ ok: true }, { status: 200 });

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
      console.error("[admin/logout] signOut failed", error);

      return adminJson(
        { error: "SIGNOUT_FAILED" },
        { status: 500 }
      );
    }

    return res;
  } catch (e: any) {
    console.error("[admin/logout] unexpected error", e);
    return adminJson(
      { error: "EXCEPTION" },
      { status: 500 }
    );
  }
}