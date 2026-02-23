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
  status: "new" | "reviewed" | "archived";
};

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_KEY ||
    "";

  // ⚠️ En admin client-side NO podemos usar service role.
  // Este panel funciona si tu tabla es readable por admin vía RLS o si lo migramos a API server-side.
  // Por ahora lo dejamos listo y si falla, en el siguiente paso lo pasamos a /api/admin/comments.
  return createClient(url, key);
}

export default function AdminCommentsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);

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
    // Esta ruta debe estar protegida server-side por proxy.ts (cookies + ADMIN_EMAIL).
    // Aquí verificamos sesión cliente para evitar flashes raros.
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

  const supabase = useMemo(() => getSupabaseAdminClient(), []);

  async function loadComments() {
    setLoading(true);
    setErrorMsg(null);

    try {
      let q = supabase
        .from("user_comments")
        .select("id,created_at,group_code,device_id,page,message,status")
        .order("created_at", { ascending: false })
        .limit(200);

      if (groupFilter !== "ALL") q = q.eq("group_code", groupFilter);
      if (statusFilter !== "ALL") q = q.eq("status", statusFilter);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      setItems((data ?? []) as CommentRow[]);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
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
                <option value="ALL">Todos</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={loadComments}
                className={btnSm + " w-full"}
              >
                {loading ? "Cargando..." : "Recargar"}
              </button>
            </div>
          </div>

          {errorMsg ? (
            <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
              Error: {errorMsg}
              <div className="mt-1 text-xs text-slate-600">
                Si esto falla por permisos (RLS), en el siguiente paso lo movemos a un API admin server-side.
              </div>
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
                      : "Archivado"}
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                  {c.message}
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  page: {c.page ?? "-"} • device: {c.device_id ?? "-"} • id: {c.id}
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  {c.status !== "reviewed" && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border-2 border-red-600 bg-green-700 text-white text-xs font-bold"
                      onClick={async () => {
                        await supabase
                          .from("user_comments")
                          .update({ status: "reviewed" })
                          .eq("id", c.id);
                        loadComments();
                      }}
                    >
                      Marcar como Revisado
                    </button>
                  )}

                  {c.status !== "archived" && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border-2 border-red-600 bg-slate-700 text-white text-xs font-bold"
                      onClick={async () => {
                        await supabase
                          .from("user_comments")
                          .update({ status: "archived" })
                          .eq("id", c.id);
                        loadComments();
                      }}
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