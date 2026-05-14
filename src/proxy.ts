import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LEGAL_COOKIE = "vc_legal_accepted";

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap") ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json|woff|woff2)$/i.test(pathname)
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isLegalOrWelcomePath(pathname: string) {
  return (
    pathname === "/pitch" ||
    pathname === "/terminos" ||
    pathname === "/privacidad" ||
    pathname === "/tratamiento-datos"
  );
}

async function protectAdmin(req: NextRequest) {
  const { pathname } = req.nextUrl;

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

  if (error || !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);

    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set("x-vc-proxy", "ON");
    return redirectRes;
  }

  if (!adminEmail || userEmail !== adminEmail) {
    const forbiddenRes = NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    forbiddenRes.headers.set("x-vc-proxy", "ON");
    return forbiddenRes;
  }

  res.headers.set("x-vc-proxy", "ON");
  return res;
}

// Next 16: archivo proxy.ts + función exportada proxy()
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Archivos públicos: permitir.
  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  // 2. API: permitir para no romper endpoints, IA, Supabase, admin APIs, cron, etc.
  if (isApiPath(pathname)) {
    return NextResponse.next();
  }

  // 3. Admin: mantener protección actual.
  if (isAdminPath(pathname)) {
    return protectAdmin(req);
  }

  // 4. Bienvenida y páginas legales: permitir siempre.
  if (isLegalOrWelcomePath(pathname)) {
    const res = NextResponse.next();
    res.headers.set("x-vc-proxy", "ON");
    return res;
  }

  // 5. Toda la app pública queda bloqueada hasta aceptar legales en /pitch.
  const legalAccepted = req.cookies.get(LEGAL_COOKIE)?.value === "true";

  if (!legalAccepted) {
    const url = req.nextUrl.clone();
    url.pathname = "/pitch";
    url.searchParams.set("next", pathname);

    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set("x-vc-proxy", "ON");
    return redirectRes;
  }

  const res = NextResponse.next();
  res.headers.set("x-vc-proxy", "ON");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};