import { type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export type AdminAuthResult =
  | { ok: true; email: string; cookiesToSet: any[] }
  | {
      ok: false;
      status: 401 | 403;
      error: "UNAUTHORIZED" | "FORBIDDEN";
      cookiesToSet: any[];
    };

export function normalizeAdminEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function isConfiguredAdminEmail(email: string | null | undefined) {
  const adminEmail = normalizeAdminEmail(process.env.ADMIN_EMAIL);
  const userEmail = normalizeAdminEmail(email);
  return Boolean(adminEmail && userEmail && userEmail === adminEmail);
}

export async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminEmail = normalizeAdminEmail(process.env.ADMIN_EMAIL);

  if (!url || !anon || !adminEmail) {
    return { ok: false, status: 401, error: "UNAUTHORIZED", cookiesToSet: [] };
  }

  const cookiesToSet: any[] = [];

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(list) {
        cookiesToSet.push(...list);
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return { ok: false, status: 401, error: "UNAUTHORIZED", cookiesToSet };
  }

  const email = normalizeAdminEmail(data.user.email);
  if (email !== adminEmail) {
    return { ok: false, status: 403, error: "FORBIDDEN", cookiesToSet };
  }

  return { ok: true, email, cookiesToSet };
}
