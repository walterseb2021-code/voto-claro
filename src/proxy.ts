import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next 16: archivo proxy.ts + función exportada proxy()
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Solo protegemos /admin
  if (!pathname.startsWith("/admin")) {
    const res = NextResponse.next();
    res.headers.set("x-vc-proxy", "ON");
    return res;
  }

  // Permitimos /admin/login (la crearemos luego)
  if (pathname === "/admin/login") {
    const res = NextResponse.next();
    res.headers.set("x-vc-proxy", "ON");
    return res;
  }

  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const userEmail = (user?.email ?? "").trim().toLowerCase();

  // Sin sesión -> /admin/login
  if (error || !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);

    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set("x-vc-proxy", "ON");
    return redirectRes;
  }

  // Con sesión pero no eres tú -> 403
  if (!adminEmail || userEmail !== adminEmail) {
    const forbiddenRes = NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    forbiddenRes.headers.set("x-vc-proxy", "ON");
    return forbiddenRes;
  }

  res.headers.set("x-vc-proxy", "ON");
  return res;
}

export const config = {
  matcher: ["/admin/:path*"],
};