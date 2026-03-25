// src/app/admin/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Device = {
  device_id: string;
  created_at: string;
  email: string | null;
  celular: string | null;
  forum_alias: string | null;
  vote_intention_answers: { count: number }[];
  archived_topic_forum_comments: { count: number }[];
  reto_ganadores?: { count: number }[];
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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [secretKey, setSecretKey] = useState('');
  const [showSecretInput, setShowSecretInput] = useState(false);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  // Verificar sesión al cargar
  useEffect(() => {
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
  }, [router, supabase.auth]);

  // Cargar dispositivos - VERSIÓN CORREGIDA (con manejo de error tipo unknown)
const loadDevices = async () => {
  setLoadingDevices(true);
  setMessage(null);

  try {
    // 1. Obtener todos los participantes
    const { data: participants, error } = await supabase
      .from('comment_access_participants')
      .select(`
        device_id,
        created_at,
        email,
        celular,
        forum_alias
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!participants || participants.length === 0) {
      setDevices([]);
      return;
    }

    // 2. Para cada dispositivo, obtener sus conteos por separado
    const devicesWithCounts = await Promise.all(
      participants.map(async (p) => {
        // Conteo de intención de voto
        const { count: voteCount } = await supabase
          .from('vote_intention_answers')
          .select('*', { count: 'exact', head: true })
          .eq('device_id', p.device_id);

        // Conteo de comentarios en foros
        const { count: commentCount } = await supabase
          .from('archived_topic_forum_comments')
          .select('*', { count: 'exact', head: true })
          .eq('device_id', p.device_id);

        // Conteo de ganadores del reto
        const { count: retoCount } = await supabase
          .from('reto_ganadores')
          .select('*', { count: 'exact', head: true })
          .eq('device_id', p.device_id);

        return {
          ...p,
          vote_intention_answers: [{ count: voteCount || 0 }],
          archived_topic_forum_comments: [{ count: commentCount || 0 }],
          reto_ganadores: [{ count: retoCount || 0 }]
        };
      })
    );

    setDevices(devicesWithCounts);
  } catch (err) {
    // CORRECCIÓN: Manejar error de tipo unknown
    const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Error cargando dispositivos:', err);
    setMessage({ type: 'error', text: 'Error al cargar dispositivos: ' + errorMessage });
  } finally {
    setLoadingDevices(false);
  }
};

  // Resetear un dispositivo específico
  const resetDevice = async (deviceId: string) => {
    if (!confirm(`¿Estás seguro de resetear el dispositivo ${deviceId}?\n\nEsto eliminará:\n- Respuestas de intención de voto\n- Comentarios en foros\n- Registro de acceso\n- Datos del reto ciudadano`)) {
      return;
    }

    setMessage(null);

    try {
      // 1. Eliminar respuestas de intención de voto
      await supabase
        .from('vote_intention_answers')
        .delete()
        .eq('device_id', deviceId);

      // 2. Eliminar comentarios en foros
      await supabase
        .from('archived_topic_forum_comments')
        .delete()
        .eq('device_id', deviceId);

      // 3. Eliminar ganadores del reto
      await supabase
        .from('reto_ganadores')
        .delete()
        .eq('device_id', deviceId);

      // 4. Eliminar registro de acceso (este es el principal)
      await supabase
        .from('comment_access_participants')
        .delete()
        .eq('device_id', deviceId);

      setMessage({ type: 'success', text: `✅ Dispositivo ${deviceId.slice(0, 8)}... reseteado correctamente` });
      
      // Recargar lista
      loadDevices();
    } catch (error) {
      console.error('Error resetando dispositivo:', error);
      setMessage({ type: 'error', text: 'Error al resetear dispositivo' });
    }
  };

  // Resetear TODOS los datos de prueba
  const resetAllTest = async () => {
    if (!secretKey) {
      setMessage({ type: 'error', text: 'Debes ingresar la clave secreta' });
      return;
    }

    if (!confirm('⚠️ ¿Resetear TODOS los datos de prueba?\n\nEsto eliminará:\n- TODAS las respuestas de intención de voto\n- TODOS los comentarios en foros\n- TODOS los registros de acceso\n- TODOS los ganadores del reto\n\nEsta acción NO SE PUEDE DESHACER.')) {
      return;
    }

    setMessage(null);

    try {
      // Llamar a la API que crearemos
      const res = await fetch('/api/admin/reset-all-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretKey })
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: '✅ Todos los datos de prueba fueron reseteados' });
        loadDevices(); // Recargar lista (debería estar vacía)
      } else {
        setMessage({ type: 'error', text: `❌ Error: ${data.error}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Error de conexión' });
    }
  };

  // Cargar dispositivos al montar
  useEffect(() => {
    if (!checking) {
      loadDevices();
    }
  }, [checking]);

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

      {/* MENSAJES */}
      {message && (
        <div className={`mt-4 p-3 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-green-100 border-green-400 text-green-800' 
            : 'bg-red-100 border-red-400 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* SECCIÓN DE NAVEGACIÓN PRINCIPAL (tus cards existentes) */}
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
                Gestión de preguntas, niveles y control.
              </div>
              <Link href="/admin/reto" className={btn + " mt-3 w-full"}>
                Abrir Admin Reto
              </Link>
            </div>

            <div className={card}>
              <div className="text-sm font-extrabold text-slate-900">💬 Comentarios Ciudadanos</div>
              <div className="mt-1 text-xs text-slate-600">
                Moderación, modo anónimo, filtro anti-lisuras.
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
                Activar/desactivar GRUPOA/B/C/D/E y ver expiración.
              </div>
              <Link href="/admin/tokens" className={btn + " mt-3 w-full"}>
                Abrir Admin Tokens
              </Link>
            </div>
                            <div className={card}>
              <div className="text-sm font-extrabold text-slate-900">👥 Afiliados APP</div>
              <div className="mt-1 text-xs text-slate-600">
                Gestionar afiliados manualmente para Espacio Emprendedor.
              </div>
              <Link href="/admin/afiliados" className={btn + " mt-3 w-full"}>
                Abrir Admin Afiliados
              </Link>
            </div>
            <div className={card}>
  <div className="text-sm font-extrabold text-slate-900">🏘️ Proyecto Ciudadano</div>
  <div className="mt-1 text-xs text-slate-600">
    Revisar y aprobar proyectos presentados por ciudadanos.
  </div>
  <Link href="/admin/proyectos" className={btn + " mt-3 w-full"}>
    Abrir Admin Proyectos
  </Link>
</div>
          </div>
        </div>
      </section>

      {/* ========== NUEVA SECCIÓN: RESET DE DATOS DE PRUEBA ========== */}
      <section className={sectionWrap + " mt-6"}>
        <div className={inner}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                🧪 Reset de Datos de Prueba
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Aquí puedes resetear dispositivos individuales o todos los datos de prueba.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={loadDevices}
                className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-700"
                disabled={loadingDevices}
              >
                {loadingDevices ? 'Cargando...' : '↻ Refrescar'}
              </button>
              
              <button
                onClick={() => setShowSecretInput(!showSecretInput)}
                className="bg-yellow-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-yellow-700"
              >
                {showSecretInput ? 'Ocultar' : 'Reset Masivo'}
              </button>
            </div>
          </div>

          {/* Reset Masivo (requiere clave) */}
          {showSecretInput && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded">
              <label className="block text-xs font-bold mb-1">
                Clave Secreta:
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="flex-1 border rounded px-3 py-2 text-sm"
                  placeholder="Ingresa la clave de admin"
                />
                <button
                  onClick={resetAllTest}
                  className="bg-red-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-700"
                >
                  ⚠️ Resetear TODO
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Esta acción eliminará TODOS los datos de prueba de todas las tablas.
              </p>
            </div>
          )}

          {/* Lista de dispositivos */}
          <div className="mt-4">
            <h3 className="text-sm font-bold mb-2">📱 Dispositivos registrados</h3>
            
            {loadingDevices ? (
              <div className="text-sm text-slate-600">Cargando dispositivos...</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-slate-600 bg-slate-50 p-4 rounded border">
                No hay dispositivos registrados.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Device ID</th>
                      <th className="p-2 text-left">Email/Celular</th>
                      <th className="p-2 text-left">Alias</th>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-center">Votos</th>
                      <th className="p-2 text-center">Coment.</th>
                      <th className="p-2 text-center">Reto</th>
                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.device_id} className="border-t hover:bg-slate-50">
                        <td className="p-2 font-mono text-xs">
                          {d.device_id.slice(0, 8)}...
                        </td>
                        <td className="p-2">
                          {d.email || d.celular || '-'}
                        </td>
                        <td className="p-2">{d.forum_alias || '-'}</td>
                        <td className="p-2 text-xs">
                          {new Date(d.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-2 text-center">
                          {d.vote_intention_answers?.[0]?.count || 0}
                        </td>
                        <td className="p-2 text-center">
                          {d.archived_topic_forum_comments?.[0]?.count || 0}
                        </td>
                        <td className="p-2 text-center">
                          {d.reto_ganadores?.[0]?.count || 0}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => resetDevice(d.device_id)}
                            className="bg-yellow-500 text-white px-2 py-1 rounded text-xs hover:bg-yellow-600"
                            title="Resetear este dispositivo"
                          >
                            Reset
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-slate-500">
            * Al resetear un dispositivo, se eliminan sus datos de: Intención de Voto, Comentarios y Reto Ciudadano.
          </div>
        </div>
      </section>

      <div className="mt-5 text-xs text-slate-600">
        Nota: si compartes links internos, igual quedan protegidos por el gate global (/pitch + cookie).
      </div>
    </main>
  );
}