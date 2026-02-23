// src/app/admin/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function AdminHubPage() {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  const [checking, setChecking] = useState(true);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    // Este hub ya está protegido server-side por proxy.ts (cookies + ADMIN_EMAIL).
    // Aquí solo verificamos que exista sesión en cliente para evitar flashes raros.
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        if (!data?.session) {
          // Si por alguna razón entró sin sesión cliente, lo llevamos al login.
          router.replace("/admin/login");
          return;
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Evita render mientras verificamos (anti-hydration / anti-flash)
  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const btnSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const card = "rounded-2xl border-2 border-red-600 bg-white/85 p-4 shadow-sm";

  if (checking) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin Central – VOTO CLARO
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Verificando sesión.
            </div>
          </div>
        </section>

        <button type="button" onClick={goBack} className={btn + " mt-4"}>
          ← Volver
        </button>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin Central – VOTO CLARO
        </h1>

        <div className="flex gap-2 flex-wrap">
          <Link href="/" className={btnSm}>
            🏠 Inicio
          </Link>
          <button type="button" onClick={goBack} className={btnSm}>
            ← Volver
          </button>
        </div>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="text-sm font-extrabold text-slate-900">
            Panel único de administración
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
            Desde aquí controlas módulos proactivos y (pronto) los tokens GRUPOA/B/C/D/E en Supabase.
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={card}>
              <div className="text-sm font-extrabold text-slate-900">🔴 Cambio con Valentía</div>
              <div className="mt-1 text-xs text-slate-600">
                Videos EN VIVO, historial y borrado (Supabase).
              </div>
              <Link href="/admin/live" className={btn + " mt-3 w-full"}>
                Abrir Admin EN VIVO
              </Link>
            </div>

            <div className={card}>
              <div className="text-sm font-extrabold text-slate-900">📊 Intención de Voto</div>
              <div className="mt-1 text-xs text-slate-600">Crear/activar/cerrar rondas.</div>
              <Link href="/admin/vote-rounds" className={btn + " mt-3 w-full"}>
                Abrir Admin Rondas
              </Link>
            </div>

            <div className={card}>
              <div className="text-sm font-extrabold text-slate-900">🎯 Reto Ciudadano</div>
              <div className="mt-1 text-xs text-slate-600">
                (Siguiente) Gestión de preguntas, niveles y control.
              </div>
              <Link href="/admin/reto" className={btn + " mt-3 w-full"}>
                Abrir Admin Reto
              </Link>
            </div>

            <div className={card}>
              <div className="text-sm font-extrabold text-slate-900">💬 Comentarios Ciudadanos</div>
              <div className="mt-1 text-xs text-slate-600">
                (Siguiente) Moderación, modo anónimo, filtro anti-lisuras.
              </div>
              <Link href="/admin/comments" className={btn + " mt-3 w-full"}>
                Abrir Admin Comentarios
              </Link>
            </div>

            <div className={card}>
              <div className="text-sm font-extrabold text-slate-900">
                🔐 Tokens / Grupos (Supabase)
              </div>
              <div className="mt-1 text-xs text-slate-600">
                (Siguiente) Activar/desactivar GRUPOA/B/C/D/E y ver expiración.
              </div>
              <Link href="/admin/tokens" className={btn + " mt-3 w-full"}>
                Abrir Admin Tokens
              </Link>
            </div>
          </div>

          <div className="mt-5 text-xs text-slate-600">
            Nota: si compartes links internos, igual quedan protegidos por el gate global (/pitch + cookie).
          </div>
        </div>
      </section>
    </main>
  );
}