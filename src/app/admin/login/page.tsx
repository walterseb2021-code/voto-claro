"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

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
    return createClient(url, key);
  }, []);

  const [email, setEmail] = useState("walterseb.2021@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    // Si ya está logueado en el cliente, intentar entrar
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace(nextPath);
    })();
  }, [supabase, router, nextPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      // 1) Login en el cliente
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      // 2) Leer tokens de sesión del cliente
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (sessErr || !session) {
        setMsg("No se pudo obtener la sesión (session null).");
        return;
      }

      // 3) Enviar tokens al server para que cree cookies (compatibles con proxy.ts)
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

      // 4) Ya con cookies server-side, entrar al panel
      router.replace(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Admin · Voto Claro</h1>
        <p style={{ marginTop: 0, marginBottom: 16, color: "#6b7280", fontSize: 14 }}>
          Inicia sesión para acceder al panel.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Contraseña</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          {msg ? <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>{msg}</div> : null}
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ color: "#6b7280", fontSize: 14 }}>Cargando…</div>
        </div>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}