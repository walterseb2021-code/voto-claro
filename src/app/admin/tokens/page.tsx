"use client";

import { useEffect, useState } from "react";

type TokenRow = {
  id: string;
  token: string;
  route: string;
  is_active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

export default function AdminTokensPage() {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadTokens() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/tokens", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data?.error ?? "Error cargando tokens");
        setRows([]);
        return;
      }
      setRows(data.tokens ?? []);
    } catch {
      setNotice("Error de red");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleToken(row: TokenRow) {
    setLoading(true);
    setNotice("Actualizando token…");
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: row.id,
          is_active: !row.is_active,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setNotice(data?.error ?? "No se pudo actualizar");
        return;
      }

      setNotice("Actualizado correctamente");
      await loadTokens();
    } catch {
      setNotice("Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTokens();
  }, []);

  return (
    <main className="min-h-screen px-6 py-8 bg-gradient-to-b from-green-50 via-white to-green-100">
      <h1 className="text-2xl font-extrabold text-slate-900">
        🔐 Admin – Tokens / Grupos
      </h1>

      {notice && (
        <div className="mt-4 text-sm font-semibold text-slate-900">
          <div className="inline-block rounded-xl bg-green-50 border-2 border-red-500 px-4 py-2">
            {notice}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading && rows.length === 0 && (
          <div className="text-sm text-slate-700">Cargando…</div>
        )}

        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border-2 border-red-600 bg-white/90 p-4 flex justify-between items-start gap-4 flex-wrap"
          >
            <div>
              <div className="font-extrabold text-slate-900">{r.token}</div>
              <div className="text-xs text-slate-600">
                Activo: {r.is_active ? "Sí" : "No"}
              </div>
              <div className="text-xs text-slate-600">Nota: {r.note ?? "-"}</div>
            </div>

            <button
              disabled={loading}
              onClick={() => toggleToken(r)}
              className={`px-4 py-2 rounded-xl border-2 border-red-600 text-white text-sm font-extrabold ${
                r.is_active
                  ? "bg-red-700 hover:bg-red-800"
                  : "bg-green-800 hover:bg-green-900"
              }`}
            >
              {r.is_active ? "Desactivar" : "Activar"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}