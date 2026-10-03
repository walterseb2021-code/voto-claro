import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isConfiguredAdminEmail } from "@/lib/adminAuth";
import {
  isAllowedAdminMutationOrigin,
  readAdminJsonObject,
} from "@/lib/adminMutationSecurity";

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

const MAX_BODY_BYTES = 16 * 1024;

// POST /api/admin/session
// Body: { access_token, refresh_token }
export async function POST(req: NextRequest) {
  try {
    if (!isAllowedAdminMutationOrigin(req)) {
      return adminJson({ error: "REQUEST_INVALID" }, { status: 403 });
    }

    const body = await readAdminJsonObject(req, MAX_BODY_BYTES);
    if (!body) {
      return adminJson({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const access_token = String(body?.access_token ?? "").trim();
    const refresh_token = String(body?.refresh_token ?? "").trim();

    if (!access_token || !refresh_token) {
      return adminJson({ error: "TOKENS_REQUIRED" }, { status: 400 });
    }

    // Respuesta que vamos a devolver (aquí se “pegan” cookies en setAll)
    let res: NextResponse = adminJson({ ok: true }, { status: 200 });

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
      console.error("[admin/session] setSession failed", error);

      return adminJson(
        { error: "SET_SESSION_FAILED" },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;

    if (userError || !user) {
      res = adminJson({ error: "UNAUTHORIZED" }, { status: 401 });
      await supabase.auth.signOut();
      return res;
    }

    if (!isConfiguredAdminEmail(user.email)) {
      res = adminJson({ error: "FORBIDDEN" }, { status: 403 });
      await supabase.auth.signOut();
      return res;
    }

    return res;
  } catch (e: any) {
    console.error("[admin/session] unexpected error", e);
    return adminJson(
      { error: "EXCEPTION" },
      { status: 500 }
    );
  }
}
