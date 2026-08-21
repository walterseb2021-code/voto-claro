"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Afiliado = {
  id: string;
  participant_id: string | null;
  dni: string;
  verified_at: string | null;
  is_active: boolean;
  created_at: string | null;
  participant_name: string | null;
  participant_email: string | null;
  participant_linked: boolean;
};

type ApiPayload = {
  ok?: boolean;
  error?: string;
  action?: string;
  afiliados?: Afiliado[];
};

const ERROR_MESSAGES: Record<string, string> = {
  DNI_INVALIDO: "Ingresa un DNI válido de 8 dígitos.",
  DNI_DE_BUSQUEDA_INVALIDO:
    "La búsqueda debe contener solamente entre 1 y 8 dígitos.",
  PARTICIPANTE_NO_ENCONTRADO:
    "No existe un participante registrado con ese DNI.",
  IDENTIDAD_INCONSISTENTE:
    "La identidad del participante no coincide con la afiliación.",
  AFILIACION_AMBIGUA:
    "Se detectó una afiliación ambigua. Requiere revisión administrativa.",
  AFILIACION_LEGACY_REQUIERE_REVISION:
    "Esta afiliación antigua no tiene participante vinculado y requiere revisión antes de reactivarse.",
  DNI_ASOCIADO_A_OTRA_AFILIACION:
    "El DNI ya está asociado a otra afiliación.",
  AFILIADO_YA_ACTIVO:
    "Ese participante ya figura como afiliado activo.",
  AFILIADO_NO_ENCONTRADO:
    "No se encontró la afiliación indicada.",
  ORIGIN_NO_AUTORIZADO:
    "La operación fue bloqueada por seguridad.",
  SOLICITUD_INVALIDA:
    "La solicitud no es válida.",
  NO_DISPONIBLE:
    "El servicio administrativo no está disponible en este momento.",
};

function apiMessage(code: unknown, fallback: string) {
  const key = String(code ?? "").trim();
  return ERROR_MESSAGES[key] ?? fallback;
}

export default function AdminAfiliadosPage() {
  const [afiliados, setAfiliados] = useState<Afiliado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nuevoDni, setNuevoDni] = useState("");
  const [buscarDni, setBuscarDni] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [mutandoId, setMutandoId] = useState<string | null>(null);

  async function readPayload(response: Response) {
    return response
      .json()
      .catch(() => ({})) as Promise<ApiPayload>;
  }

  function handleUnauthorized(response: Response) {
    if (response.status === 401 || response.status === 403) {
      window.location.assign("/admin/login");
      return true;
    }

    return false;
  }

  async function cargarAfiliados(searchValue = buscarDni) {
    setLoading(true);
    setError(null);

    try {
      const search = searchValue.trim();

      if (search && !/^\d{1,8}$/.test(search)) {
        setError(
          "La búsqueda debe contener solamente entre 1 y 8 dígitos."
        );
        return;
      }

      const params = new URLSearchParams();
      if (search) params.set("dni", search);

      const url =
        params.size > 0
          ? `/api/admin/afiliados?${params.toString()}`
          : "/api/admin/afiliados";

      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (handleUnauthorized(response)) return;

      const payload = await readPayload(response);

      if (!response.ok || payload.ok !== true) {
        throw new Error(
          apiMessage(
            payload.error,
            "No se pudo cargar la lista de afiliados."
          )
        );
      }

      setAfiliados(
        Array.isArray(payload.afiliados)
          ? payload.afiliados
          : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la lista de afiliados."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void cargarAfiliados("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregarAfiliado() {
    const dni = nuevoDni.trim();

    if (!/^\d{8}$/.test(dni)) {
      setMessage("❌ Ingresa un DNI válido de 8 dígitos.");
      return;
    }

    setAgregando(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/afiliados", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ dni }),
      });

      if (handleUnauthorized(response)) return;

      const payload = await readPayload(response);

      if (!response.ok || payload.ok !== true) {
        setMessage(
          `❌ ${apiMessage(
            payload.error,
            "No se pudo registrar la afiliación."
          )}`
        );
        return;
      }

      const wasReactivated =
        payload.action === "reactivated";

      setMessage(
        wasReactivated
          ? `✅ Afiliación reactivada correctamente para el DNI ${dni}.`
          : `✅ Afiliación creada correctamente para el DNI ${dni}.`
      );

      setNuevoDni("");
      await cargarAfiliados("");
    } catch {
      setMessage(
        "❌ No se pudo completar la operación administrativa."
      );
    } finally {
      setAgregando(false);
    }
  }

  async function cambiarEstado(afiliado: Afiliado) {
    const targetActive = !afiliado.is_active;

    if (
      !targetActive &&
      !window.confirm(
        `¿Desactivar la afiliación con DNI ${afiliado.dni}? ` +
          "No se borrará el registro ni su historial."
      )
    ) {
      return;
    }

    setMutandoId(afiliado.id);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/afiliados", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          id: afiliado.id,
          is_active: targetActive,
        }),
      });

      if (handleUnauthorized(response)) return;

      const payload = await readPayload(response);

      if (!response.ok || payload.ok !== true) {
        setMessage(
          `❌ ${apiMessage(
            payload.error,
            "No se pudo actualizar la afiliación."
          )}`
        );
        return;
      }

      setMessage(
        targetActive
          ? `✅ Afiliación con DNI ${afiliado.dni} reactivada.`
          : `✅ Afiliación con DNI ${afiliado.dni} desactivada sin borrar su historial.`
      );

      await cargarAfiliados(buscarDni);
    } catch {
      setMessage(
        "❌ No se pudo completar la operación administrativa."
      );
    } finally {
      setMutandoId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">
            Admin - Gestión de Afiliados APP
          </h1>

          <Link
            href="/admin"
            className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
          >
            ← Volver al Admin
          </Link>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-xl border p-3 text-sm ${
              message.includes("✅")
                ? "border-green-300 bg-green-100 text-green-800"
                : message.includes("⚠️")
                  ? "border-yellow-300 bg-yellow-100 text-yellow-800"
                  : "border-red-300 bg-red-100 text-red-800"
            }`}
          >
            {message}
          </div>
        )}

        <div className="mb-6 rounded-2xl border-2 border-blue-600 bg-white p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-slate-900">
            <span className="text-2xl">🛡️</span>
            Gestión administrativa segura
          </h2>

          <p className="text-slate-600">
            Las afiliaciones se gestionan mediante una API administrativa
            protegida. Las altas se validan contra participantes registrados.
            Al retirar una afiliación se desactiva el registro en lugar de
            borrarlo, preservando proyectos, mensajes y demás referencias
            históricas.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border-2 border-green-600 bg-white p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-slate-900">
            <span className="text-2xl">➕</span>
            Agregar o reactivar afiliado
          </h2>

          <p className="mb-4 text-slate-600">
            Ingresa el DNI de un participante previamente registrado.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="DNI (8 dígitos)"
              value={nuevoDni}
              onChange={(event) =>
                setNuevoDni(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 8)
                )
              }
              className="flex-1 rounded-xl border-2 border-slate-300 px-4 py-2 focus:border-green-500 focus:outline-none"
              maxLength={8}
            />

            <button
              type="button"
              onClick={() => void agregarAfiliado()}
              disabled={agregando}
              className="rounded-xl bg-green-700 px-6 py-2 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {agregando ? "Procesando..." : "Agregar / Reactivar"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              Lista de afiliados
            </h2>

            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Buscar por DNI..."
                value={buscarDni}
                onChange={(event) =>
                  setBuscarDni(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 8)
                  )
                }
                className="rounded-xl border-2 border-slate-300 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
              />

              <button
                type="button"
                onClick={() => void cargarAfiliados(buscarDni)}
                className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
              >
                Buscar
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-slate-500">
              Cargando afiliados...
            </div>
          ) : afiliados.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              No se encontraron afiliados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3 text-left">DNI</th>
                    <th className="p-3 text-left">Nombre</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Verificado</th>
                    <th className="p-3 text-left">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {afiliados.map((afiliado) => (
                    <tr
                      key={afiliado.id}
                      className="border-t hover:bg-slate-50"
                    >
                      <td className="p-3 font-mono">
                        {afiliado.dni}
                      </td>

                      <td className="p-3">
                        <div>
                          {afiliado.participant_name || "-"}
                        </div>

                        {!afiliado.participant_linked && (
                          <div className="mt-1 text-xs font-semibold text-amber-700">
                            Registro legacy sin participante vinculado
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        {afiliado.participant_email || "-"}
                      </td>

                      <td className="p-3">
                        {afiliado.verified_at
                          ? new Date(
                              afiliado.verified_at
                            ).toLocaleDateString("es-PE")
                          : "-"}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            afiliado.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {afiliado.is_active
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            void cambiarEstado(afiliado)
                          }
                          disabled={mutandoId === afiliado.id}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:opacity-50 ${
                            afiliado.is_active
                              ? "bg-amber-600 hover:bg-amber-700"
                              : "bg-green-700 hover:bg-green-800"
                          }`}
                        >
                          {mutandoId === afiliado.id
                            ? "Procesando..."
                            : afiliado.is_active
                              ? "Desactivar"
                              : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}