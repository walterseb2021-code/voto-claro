"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type WinnerRow = {
  id: string;
  created_at: string;
  group_code: string;
  dni: string;
  celular: string;
  email: string;
  device_id: string | null;
  prize_segment: number;
  prize_note: string | null;
  year_month: string;
  status: "pendiente" | "contactado" | "entregado" | "anulado";
};

const STATUS_LABEL: Record<WinnerRow["status"], string> = {
  pendiente: "Pendiente",
  contactado: "Contactado",
  entregado: "Entregado",
  anulado: "Anulado",
};

export default function AdminRetoPage() {
  const [rows, setRows] = useState<WinnerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [group, setGroup] = useState("Todos");
  const [status, setStatus] = useState("pendiente");

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  async function load() {
    setLoading(true);
    setNotice(null);

    try {
      const qs = new URLSearchParams();
      qs.set("group", group);
      qs.set("status", status);

      const res = await fetch(`/api/admin/reto/winners?${qs.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json();
      if (!res.ok) {
        setNotice(data?.error ?? "Error cargando ganadores");
        setRows([]);
        return;
      }

      setRows(data.winners ?? []);
    } catch {
      setNotice("Error de red");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, nextStatus: WinnerRow["status"]) {
    setLoading(true);
    setNotice("Actualizando…");

    try {
      const res = await fetch("/api/admin/reto/winners", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        setNotice(data?.error ?? "No se pudo actualizar");
        return;
      }

      setNotice("Actualizado ✔");
      await load();
    } catch {
      setNotice("Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setLoading(true);
    setNotice("Cerrando sesión…");

    try {
      // 1) client-side signOut (localStorage)
      await supabase.auth.signOut();

      // 2) server-side signOut (cookies) para que proxy.ts te bloquee
      await fetch("/api/admin/logout", { method: "POST" });

      // 3) volver al login
      window.location.href = "/admin/login";
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btnSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          🎯 Admin – Reto Ciudadano (Ganadores)
        </h1>

        <div className="flex gap-2 flex-wrap">
          <Link href="/admin" className={btnSm}>
            🧭 Admin Central
          </Link>
          <Link href="/" className={btnSm}>
            🏠 Inicio
          </Link>

          <button
            onClick={onLogout}
            disabled={loading}
            className={btnSm}
            type="button"
            title="Cerrar sesión"
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-4 text-sm font-semibold text-slate-900">
          <div className="inline-block rounded-xl bg-green-50 border-2 border-red-500 px-4 py-2">
            {notice}
          </div>
        </div>
      )}

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <div className="text-xs font-extrabold text-slate-900">Grupo</div>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="mt-1 rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold"
              >
                <option>Todos</option>
                <option>GRUPOA</option>
                <option>GRUPOB</option>
                <option>GRUPOC</option>
                <option>GRUPOD</option>
                <option>GRUPOE</option>
              </select>
            </div>

            <div>
              <div className="text-xs font-extrabold text-slate-900">Estado</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold"
              >
                <option value="Todos">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="contactado">Contactado</option>
                <option value="entregado">Entregado</option>
                <option value="anulado">Anulado</option>
              </select>
            </div>

            <button
              disabled={loading}
              onClick={load}
              className="px-4 py-2 rounded-xl border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold hover:bg-green-900 disabled:opacity-60"
              type="button"
            >
              Recargar
            </button>
          </div>

          <div className="mt-4 text-xs text-slate-600">
            Total: <b>{rows.length}</b>
          </div>

          <div className="mt-4 space-y-3">
            {loading && rows.length === 0 && (
              <div className="text-sm text-slate-700">Cargando…</div>
            )}

            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border-2 border-red-600 bg-white p-4 flex justify-between gap-4 flex-wrap"
              >
                <div className="min-w-[240px]">
                  <div className="text-sm font-extrabold text-slate-900">
                    {r.group_code} • {new Date(r.created_at).toLocaleString()}
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    Celular: {r.celular} • DNI: {r.dni}
                  </div>

                  <div className="mt-1 text-xs text-slate-600">
                    Email: {r.email} • Segmento: <b>#{r.prize_segment}</b> • Mes:{" "}
                    {r.year_month}
                  </div>

                  {r.prize_note && (
                    <div className="mt-1 text-xs text-slate-600">
                      Nota: {r.prize_note}
                    </div>
                  )}

                  <div className="mt-1 text-[11px] text-slate-500 break-all">
                    id: {r.id}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs font-extrabold text-slate-900">
                    Estado: {STATUS_LABEL[r.status]}
                  </div>

                  <select
                    value={r.status}
                    disabled={loading}
                    onChange={(e) =>
                      updateStatus(r.id, e.target.value as WinnerRow["status"])
                    }
                    className="rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="contactado">Contactado</option>
                    <option value="entregado">Entregado</option>
                    <option value="anulado">Anulado</option>
                  </select>
                </div>
              </div>
            ))}

            {!loading && rows.length === 0 && (
              <div className="text-sm text-slate-700">
                No hay ganadores con esos filtros.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}