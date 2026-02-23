// src/app/admin/comments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type CommentRow = {
  id: string;
  created_at: string;
  group_code: string;
  device_id: string | null;
  page: string | null;
  message: string;
  status: "new" | "reviewed" | "archived" | "blocked";
};

export default function AdminCommentsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);

  // Se usa SOLO para verificar sesión (login) y evitar flashes raros.
  const supabaseSessionClient = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("new");

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/admin");
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabaseSessionClient.auth.getSession();
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

  async function loadComments() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "200");

      // Si eliges "Todos", no mandamos status
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/comments?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          json?.reason
            ? `No autorizado (${json.reason}).`
            : json?.detail
            ? json.detail
            : json?.error
            ? json.error
            : "Error desconocido.";
        throw new Error(msg);
      }

      let list = (json?.items ?? []) as CommentRow[];

      // Filtro por grupo (lo hacemos aquí para no tocar el API)
      if (groupFilter !== "ALL") {
        list = list.filter((x) => x.group_code === groupFilter);
      }

      setItems(list);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id: string, status: "reviewed" | "archived") {
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id, status }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          json?.reason
            ? `No autorizado (${json.reason}).`
            : json?.detail
            ? json.detail
            : json?.error
            ? json.error
            : "Error desconocido.";
        throw new Error(msg);
      }

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    if (checking) return;
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, groupFilter, statusFilter]);

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btnSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition shadow-sm";
  const select =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";

  if (checking) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – Comentarios
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Verificando sesión.
            </div>
          </div>
        </section>

        <button type="button" onClick={goBack} className={btnSm + " mt-4"}>
          ← Volver
        </button>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – Comentarios
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin" className={btnSm}>
            🛠 Admin Central
          </Link>
          <button type="button" onClick={goBack} className={btnSm}>
            ← Volver
          </button>
        </div>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-700">Grupo</div>
              <select
                className={select}
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="ALL">Todos</option>
                <option value="GRUPOA">GRUPOA</option>
                <option value="GRUPOB">GRUPOB</option>
                <option value="GRUPOC">GRUPOC</option>
                <option value="GRUPOD">GRUPOD</option>
                <option value="GRUPOE">GRUPOE</option>
              </select>
            </div>

            <div>
              <div className="text-xs font-extrabold text-slate-700">Estado</div>
              <select
                className={select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="new">new</option>
                <option value="reviewed">reviewed</option>
                <option value="archived">archived</option>
                <option value="blocked">blocked</option>
                <option value="ALL">Todos</option>
              </select>
            </div>

            <div className="flex items-end">
              <button type="button" onClick={loadComments} className={btnSm + " w-full"}>
                {loading ? "Cargando..." : "Recargar"}
              </button>
            </div>
          </div>

          {errorMsg ? (
            <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
              Error: {errorMsg}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {items.length === 0 && !loading ? (
              <div className="text-sm font-semibold text-slate-700">
                No hay comentarios para mostrar.
              </div>
            ) : null}

            {items.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
              >
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="text-xs font-extrabold text-slate-900">
                    {c.group_code} • {new Date(c.created_at).toLocaleString()}
                  </div>
                  <div className="text-xs font-extrabold text-slate-700">
                    status:{" "}
                    {c.status === "new"
                      ? "Nuevo"
                      : c.status === "reviewed"
                      ? "Revisado"
                      : c.status === "archived"
                      ? "Archivado"
                      : "Bloqueado"}
                  </div>
                </div>

                <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                  {c.message}
                </div>

                <div className="mt-2 text-xs text-slate-600">
                  page: {c.page ?? "-"} • device: {c.device_id ?? "-"} • id: {c.id}
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  {c.status !== "reviewed" && c.status !== "blocked" && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border-2 border-red-600 bg-green-700 text-white text-xs font-bold"
                      onClick={() => setStatus(c.id, "reviewed")}
                    >
                      Marcar como Revisado
                    </button>
                  )}

                  {c.status !== "archived" && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border-2 border-red-600 bg-slate-700 text-white text-xs font-bold"
                      onClick={() => setStatus(c.id, "archived")}
                    >
                      Marcar como Archivado
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}