"use client";

import { useEffect, useState } from "react";

type PitchGroup =
  | "GRUPOA"
  | "GRUPOB"
  | "GRUPOC"
  | "GRUPOD"
  | "GRUPOE";

type TokenRow = {
  id: string;
  token: string;
  route: string;
  is_active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

const GROUPS: PitchGroup[] = [
  "GRUPOA",
  "GRUPOB",
  "GRUPOC",
  "GRUPOD",
  "GRUPOE",
];

export default function AdminTokensPage() {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedGroup, setSelectedGroup] =
    useState<PitchGroup>("GRUPOA");

  const [generatedToken, setGeneratedToken] =
    useState<string | null>(null);

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

      setRows(Array.isArray(data?.tokens) ? data.tokens : []);
    } catch {
      setNotice("Error de red");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function generateToken() {
    const confirmed = window.confirm(
      `Se generará un nuevo token seguro para ${selectedGroup}. ` +
        "El token anterior no será desactivado automáticamente. ¿Continuar?"
    );

    if (!confirmed) return;

    setLoading(true);
    setNotice("Generando token seguro...");
    setGeneratedToken(null);

    try {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group_code: selectedGroup,
          expires_at: null,
          note: "Token seguro generado desde el panel administrativo",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.error === "CONFLICT") {
          setNotice(
            "No se puede crear otro token activo para ese grupo. " +
              "Revise los tokens actualmente activos."
          );
        } else {
          setNotice(data?.error ?? "No se pudo generar el token");
        }
        return;
      }

      if (typeof data?.token !== "string" || !data.token) {
        setNotice("El servidor no devolvió un token válido");
        return;
      }

      setGeneratedToken(data.token);
      setNotice(
        "Token seguro generado correctamente. " +
          "El token anterior no fue desactivado."
      );

      await loadTokens();

      setGeneratedToken(data.token);
      setNotice(
        "Token seguro generado correctamente. " +
          "El token anterior no fue desactivado."
      );
    } catch {
      setNotice("Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function toggleToken(row: TokenRow) {
    const action = row.is_active ? "desactivar" : "activar";

    const confirmed = window.confirm(
      `¿Desea ${action} este token?`
    );

    if (!confirmed) return;

    setLoading(true);
    setNotice("Actualizando token...");

    try {
      const res = await fetch("/api/admin/tokens", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: row.id,
          is_active: !row.is_active,
          expires_at: row.expires_at,
          note: row.note,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.error === "CONFLICT") {
          setNotice(
            "La operación fue bloqueada por las reglas de seguridad."
          );
        } else if (data?.error === "STATE_INVALID") {
          setNotice(
            "El estado solicitado no es válido para este token."
          );
        } else {
          setNotice(data?.error ?? "No se pudo actualizar");
        }
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

  async function copyGeneratedToken() {
    if (!generatedToken) return;

    try {
      await navigator.clipboard.writeText(generatedToken);
      setNotice("Token copiado al portapapeles");
    } catch {
      setNotice("No se pudo copiar automáticamente");
    }
  }

  useEffect(() => {
    void loadTokens();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-extrabold text-slate-900">
          Administración de accesos /pitch
        </h1>

        <p className="mt-2 text-sm text-slate-700">
          Genera y administra los tokens de acceso de GRUPOA a GRUPOE.
        </p>

        <div className="mt-6 rounded-2xl border-2 border-green-700 bg-white p-5">
          <h2 className="text-lg font-extrabold text-slate-900">
            Generar nuevo token seguro
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            El token anterior del grupo no será desactivado automáticamente.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={selectedGroup}
              disabled={loading}
              onChange={(event) =>
                setSelectedGroup(
                  event.target.value as PitchGroup
                )
              }
              className="rounded-xl border-2 border-slate-300 bg-white px-4 py-2 font-bold text-slate-900"
            >
              {GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={loading}
              onClick={generateToken}
              className="rounded-xl border-2 border-green-900 bg-green-800 px-4 py-2 text-sm font-extrabold text-white hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Generar token seguro
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={loadTokens}
              className="rounded-xl border-2 border-slate-500 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Recargar
            </button>
          </div>
        </div>

        {generatedToken && (
          <div className="mt-5 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4">
            <div className="text-sm font-extrabold text-slate-900">
              Nuevo token generado
            </div>

            <div className="mt-2 break-all rounded-xl bg-white p-3 font-mono text-sm text-slate-900">
              {generatedToken}
            </div>

            <button
              type="button"
              onClick={copyGeneratedToken}
              className="mt-3 rounded-xl border-2 border-amber-700 bg-amber-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-amber-700"
            >
              Copiar token
            </button>
          </div>
        )}

        {notice && (
          <div className="mt-4 text-sm font-semibold text-slate-900">
            <div className="inline-block rounded-xl border-2 border-red-500 bg-green-50 px-4 py-2">
              {notice}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {loading && rows.length === 0 && (
            <div className="text-sm text-slate-700">
              Cargando...
            </div>
          )}

          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="break-all font-mono text-sm font-extrabold text-slate-900">
                  {row.token}
                </div>

                <div className="mt-2 text-xs text-slate-600">
                  Activo: {row.is_active ? "Sí" : "No"}
                </div>

                <div className="text-xs text-slate-600">
                  Expira: {row.expires_at ?? "Sin expiración"}
                </div>

                <div className="text-xs text-slate-600">
                  Nota: {row.note ?? "-"}
                </div>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => toggleToken(row)}
                className={`rounded-xl border-2 border-red-600 px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                  row.is_active
                    ? "bg-red-700 hover:bg-red-800"
                    : "bg-green-800 hover:bg-green-900"
                }`}
              >
                {row.is_active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}

          {!loading && rows.length === 0 && (
            <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-600">
              No se encontraron tokens de /pitch.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}