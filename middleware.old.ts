import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Solo protegemos /admin
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Permitimos la página de login (la crearás en el siguiente paso)
  if (pathname === "/admin/login") {
    return NextResponse.next();
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
          // Importante: en middleware debes “devolver” cookies en la response
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

  // Si no hay sesión → manda a /admin/login
  if (error || !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Si hay sesión pero no es tu correo → 403
  if (!adminEmail || userEmail !== adminEmail) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
res.headers.set("x-vc-middleware", "ON");
  return res;
}

export const config = {
  matcher: ["/admin/:path*"],
};