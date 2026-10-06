// src/app/admin/page.tsx
"use client";

import AdminButton from "@/components/admin/AdminButton";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminNavActions from "@/components/admin/AdminNavActions";
import AdminCard from "@/components/admin/AdminCard";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Device = {
  device_id: string;
  created_at: string;
  email: string | null;
  celular: string | null;
  forum_alias: string | null;
  voteCount: number;
  commentCount: number;

};

export default function AdminHubPage() {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  const [checking, setChecking] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setChecking(false);
  }, []);

  const loadDevices = async () => {
    setLoadingDevices(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/devices", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo cargar dispositivos");
      }

      setDevices(Array.isArray(data?.devices) ? data.devices : []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Error desconocido";
      console.error("Error cargando dispositivos:", err);
      setMessage({
        type: "error",
        text: "Error al cargar dispositivos: " + errorMessage,
      });
    } finally {
      setLoadingDevices(false);
    }
  };

  const resetDevice = async (deviceId: string) => {
    if (
      !confirm(
        `¿Estás seguro de resetear el dispositivo ${deviceId}?\n\nEsto eliminará:\n- Respuestas de intención de voto\n- Comentarios en foros\n- Registro de acceso`
      )
    ) {
      return;
    }

    setMessage(null);

    try {
      const res = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "reset-device", device_id: deviceId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || "No se pudo resetear dispositivo");
      }

      setMessage({
        type: "success",
        text: `✅ Dispositivo ${deviceId.slice(0, 8)}... reseteado correctamente`,
      });

      loadDevices();
    } catch (error) {
      console.error("Error resetando dispositivo:", error);
      setMessage({ type: "error", text: "Error al resetear dispositivo" });
    }
  };

  useEffect(() => {
    if (!checking) {
      loadDevices();
    }
  }, [checking]);

  if (checking) {
    return (
      <AdminPageShell>
        <AdminHeader title="Admin Central – VOTO CLARO" />

        <section className="space-y-4">
          <AdminCard elevated>
            <div className="text-xl font-extrabold text-black">Cargando…</div>
            <div className="mt-2 text-base text-slate-800 leading-relaxed">
              Verificando sesión.
            </div>
          </AdminCard>
        </section>

        <AdminButton type="button" onClick={goBack}>
          ← Volver
        </AdminButton>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminHeader title="Admin Central – VOTO CLARO" actions={
        <AdminNavActions>
          <AdminButton href="/">🏠 Inicio</AdminButton>
          <AdminButton type="button" onClick={goBack}>← Volver</AdminButton>
        </AdminNavActions>
      } />

      {message && (
        <div
          className={`p-4 rounded-2xl border ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <div className="text-xl font-extrabold text-black">
            Panel único de administración
          </div>

          <div className="mt-2 text-base text-slate-800 leading-relaxed">
            Desde aquí controlas módulos proactivos, participación ciudadana,
            Espacio Emprendedor, capacitaciones, tokens y dispositivos de prueba.
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                🔴 Cambio con Valentía
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Videos EN VIVO, historial y borrado (Supabase).
              </div>
              <AdminButton href="/admin/live" className="mt-3 w-full">
                Abrir Admin EN VIVO
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                📊 Intención de Voto
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Crear/activar/cerrar rondas.
              </div>
              <AdminButton href="/admin/vote-rounds" className="mt-3 w-full">
                Abrir Admin Rondas
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                🎯 Reto Ciudadano
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Gestión de preguntas, niveles y control.
              </div>
              <AdminButton href="/admin/reto" className="mt-3 w-full">
                Abrir Admin Reto
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                💬 Comentarios Ciudadanos
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Moderación, modo anónimo, filtro anti-lisuras.
              </div>
              <AdminButton href="/admin/comments" className="mt-3 w-full">
                Abrir Admin Comentarios
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                🔐 Tokens / Grupos (Supabase)
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Activar/desactivar GRUPOA/B/C/D/E y ver expiración.
              </div>
              <AdminButton href="/admin/tokens" className="mt-3 w-full">
                Abrir Admin Tokens
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                👥 Afiliados APP
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Gestionar afiliados manualmente para Espacio Emprendedor.
              </div>
              <AdminButton href="/admin/afiliados" className="mt-3 w-full">
                Abrir Admin Afiliados
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                🏘️ Proyecto Ciudadano
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Revisar y aprobar proyectos presentados por ciudadanos.
              </div>
              <AdminButton href="/admin/proyectos" className="mt-3 w-full">
                Abrir Admin Proyectos
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                🏆 Solo para ganadores
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Gestionar ganadores, evento del semestre, fotos, videos,
                entrevistas y reconocimientos.
              </div>
              <AdminButton href="/admin/solo-ganadores" className="mt-3 w-full">
                Abrir Admin Ganadores
              </AdminButton>
            </AdminCard>

            <AdminCard>
              <div className="text-xl font-extrabold text-black">
                📚 Capacitaciones
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Revisar, aprobar, observar, desactivar o reactivar cursos,
                talleres, videos y materiales publicados por profesionales.
              </div>
              <AdminButton href="/admin/capacitaciones" className="mt-3 w-full">
                Abrir Admin Capacitaciones
              </AdminButton>
            </AdminCard>
          </div>
        </div>
      </section>

      <section>
        <AdminCard elevated>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xl font-extrabold text-black">
                🧪 Dispositivos de Prueba
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Puedes revisar y resetear dispositivos individuales de prueba.
              </div>
            </div>

            <div className="flex gap-2">
              <AdminButton
                onClick={loadDevices}
                disabled={loadingDevices}
              >
                {loadingDevices ? "Cargando..." : "↻ Refrescar"}
              </AdminButton>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-xl font-bold mb-2">📱 Dispositivos registrados</h3>

            {loadingDevices ? (
              <div className="text-sm text-slate-700">Cargando dispositivos...</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-200">
                No hay dispositivos registrados.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 rounded-lg border border-slate-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Device ID</th>
                      <th className="p-2 text-left">Email/Celular</th>
                      <th className="p-2 text-left">Alias</th>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-center">Votos</th>
                      <th className="p-2 text-center">Coment.</th>

                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.device_id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="p-2 font-mono text-sm">
                          {d.device_id.slice(0, 8)}...
                        </td>
                        <td className="p-2">{d.email || d.celular || "-"}</td>
                        <td className="p-2">{d.forum_alias || "-"}</td>
                        <td className="p-2 text-sm">
                          {new Date(d.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-2 text-center">
                          {d.voteCount || 0}
                        </td>
                        <td className="p-2 text-center">
                          {d.commentCount || 0}
                        </td>
                        <td className="p-2 text-center">
                          <AdminButton
                            onClick={() => resetDevice(d.device_id)}
                            variant="danger"
                            title="Resetear este dispositivo"
                          >
                            Reset
                          </AdminButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-slate-700">
            * Al resetear un dispositivo, se eliminan sus datos de: Intención de
            Voto y Comentarios.
          </div>
        </AdminCard>
      </section>

      <div className="text-sm text-slate-700">
        Nota: si compartes links internos, igual quedan protegidos por el gate global (/pitch + cookie).
      </div>
    </AdminPageShell>
  );
}
