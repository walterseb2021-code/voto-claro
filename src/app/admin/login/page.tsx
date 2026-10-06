"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import AdminButton from "@/components/admin/AdminButton";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminNavActions from "@/components/admin/AdminNavActions";
import AdminCard from "@/components/admin/AdminCard";

// ✅ Evita prerender/SSG en build (Vercel) para esta página
export const dynamic = "force-dynamic";

function AdminLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => {
    const n = searchParams.get("next");
    // Evitar open-redirect: solo permitir rutas internas
    if (!n || !n.startsWith("/")) return "/admin";
    return n;
  }, [searchParams]);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  const [email, setEmail] = useState("walterseb.2021@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

   async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setMsg("");
  setLoading(true);

  try {
    // 1) Login en el cliente
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    // 2) Use the session returned by signInWithPassword without persisting it in the browser.
    const session = authData.session;

    if (!session) {
      setMsg("No se pudo obtener la sesion.");
      return;
    }

    // 3) Enviar tokens al server para que cree cookies
    const r = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg(j?.detail ? String(j.detail) : "No se pudo crear sesión en servidor.");
      return;
    }

    // 4) Entrar al panel
    router.replace(nextPath);
    router.refresh();
  } finally {
    setLoading(false);
  }
}

  return (
    <AdminPageShell centered>
      <AdminCard elevated className="w-full max-w-md space-y-6">
        <AdminHeader title="Admin · Voto Claro" description="Inicia sesión para acceder al panel." />
        <AdminNavActions><AdminButton href="/">🏠 Inicio</AdminButton></AdminNavActions>

        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-base font-semibold">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-base font-semibold">Contraseña</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
            />
          </label>

          <AdminButton
            type="submit"
            variant="primary"
            disabled={loading}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </AdminButton>

          {msg ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div> : null}
        </form>
      </AdminCard>
    </AdminPageShell>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <AdminPageShell centered>
          <AdminCard elevated className="w-full max-w-md text-slate-600">Cargando…</AdminCard>
        </AdminPageShell>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}