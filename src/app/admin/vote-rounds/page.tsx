// src/app/admin/vote-rounds/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Round = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full border border-green-200 bg-green-100 text-green-800 font-medium">
      {children}
    </span>
  );
}

export default function AdminVoteRoundsPage() {
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
    // Esta ruta debe estar protegida server-side por proxy.ts (cookies + ADMIN_EMAIL).
    // Aquí verificamos sesión cliente para evitar flashes raros.
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        if (!data?.session) {
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

  // Data
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [newName, setNewName] = useState("");

  async function loadRounds() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/vote/admin/rounds", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();
      if (!res.ok) {
        setNotice(data?.error ?? "No se pudo cargar rondas.");
        setRounds([]);
        return;
      }
      setRounds((data?.rounds ?? []) as Round[]);
    } catch {
      setNotice("Error de red cargando rondas.");
      setRounds([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checking) return;
    void loadRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  const activeRound = useMemo(
    () => rounds.find((r) => r.is_active) ?? null,
    [rounds]
  );

  async function createRound() {
    const name = newName.trim();
    if (!name) {
      setNotice("Escribe un nombre para la nueva ronda.");
      return;
    }

    setLoading(true);
    setNotice("Creando nueva ronda activa…");
    try {
      const res = await fetch("/api/vote/admin/rounds", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        setNotice(data?.error ?? "No se pudo crear la ronda.");
        return;
      }

      setNewName("");
      setNotice("Listo. Nueva ronda creada y activada.");
      await loadRounds();
    } catch {
      setNotice("Error de red creando ronda.");
    } finally {
      setLoading(false);
    }
  }

  async function activateRound(round_id: string) {
    setLoading(true);
    setNotice("Activando ronda…");
    try {
      const res = await fetch("/api/vote/admin/rounds", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data?.error ?? "No se pudo activar la ronda.");
        return;
      }
      setNotice("Ronda activada.");
      await loadRounds();
    } catch {
      setNotice("Error de red activando ronda.");
    } finally {
      setLoading(false);
    }
  }

  async function closeRound(round_id: string) {
    const ok = window.confirm(
      "¿Cerrar esta ronda?\n\nEsto la deja INACTIVA pero NO borra historial.\n\n(La encuesta pública usará la ronda activa; si no hay activa, /api/vote/active fallará.)"
    );
    if (!ok) return;

    setLoading(true);
    setNotice("Cerrando ronda…");
    try {
      const res = await fetch("/api/vote/admin/rounds", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data?.error ?? "No se pudo cerrar la ronda.");
        return;
      }
      setNotice("Ronda cerrada.");
      await loadRounds();
    } catch {
      setNotice("Error de red cerrando ronda.");
    } finally {
      setLoading(false);
    }
  }

  // Styles coherentes con tu verde/rojo
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
  const btnDangerSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-red-700 text-white text-xs font-extrabold " +
    "hover:bg-red-800 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const input =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-3 " +
    "text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600";

  if (checking) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – Rondas de Voto
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
          Admin – Rondas de Voto
        </h1>

        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/live" className={btnSm}>
            🔴 Admin EN VIVO
          </Link>
          <button type="button" onClick={goBack} className={btnSm}>
            ← Volver
          </button>
        </div>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Ronda activa</div>
              <div className="mt-1 text-sm text-slate-800">
                {activeRound ? (
                  <>
                    <Pill>Activa</Pill>{" "}
                    <span className="ml-2 font-extrabold text-slate-900">
                      {activeRound.name}
                    </span>
                  </>
                ) : (
                  <span className="text-red-700 font-extrabold">No hay ronda activa</span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-600">
                El público nunca ve “rondas”. La encuesta usa internamente la ronda activa.
              </div>
            </div>

            <button type="button" onClick={loadRounds} className={btnSm} disabled={loading}>
              {loading ? "Cargando…" : "↻ Refrescar"}
            </button>
          </div>

          {notice ? (
            <div className="mt-4 text-sm text-slate-900">
              <div className="inline-block rounded-xl bg-green-50 border-2 border-red-500 px-4 py-2">
                {notice}
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
            <div className="text-sm font-extrabold text-slate-900">
              Crear nueva ronda (recomendado para “reset”)
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Crea una ronda nueva y la activa. No borra historial.
            </div>

            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder='Ej: "Intención de voto — Semana 2 (Producción)"'
              className={input}
            />

            <button
              type="button"
              onClick={createRound}
              className={btn + " mt-3"}
              disabled={loading}
            >
              ➕ Crear y activar
            </button>
          </div>

          <div className="mt-6 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
            <div className="text-sm font-extrabold text-slate-900">Historial de rondas (admin)</div>

            {loading && rounds.length === 0 ? (
              <div className="mt-3 text-sm text-slate-700">Cargando…</div>
            ) : rounds.length === 0 ? (
              <div className="mt-3 text-sm text-slate-700">No hay rondas registradas.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {rounds.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl border-2 border-red-600 bg-green-50/50 p-3 flex items-start justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 break-words">
                        {r.name}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600">
                        {new Date(r.created_at).toLocaleString("es-PE")} · ID: {r.id}
                      </div>
                      <div className="mt-2">
                        {r.is_active ? <Pill>Activa</Pill> : <Pill>Inactiva</Pill>}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className={btnSm}
                        disabled={loading || r.is_active}
                        onClick={() => activateRound(r.id)}
                        title="Hace esta ronda la activa"
                      >
                        ✅ Activar
                      </button>

                      <button
                        type="button"
                        className={btnDangerSm}
                        disabled={loading || !r.is_active}
                        onClick={() => closeRound(r.id)}
                        title="Cierra (desactiva) esta ronda"
                      >
                        ⛔ Cerrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 text-xs text-slate-700">
            Importante: si cierras la ronda activa, asegúrate de activar otra o crear una nueva.
          </div>
        </div>
      </section>
    </main>
  );
}