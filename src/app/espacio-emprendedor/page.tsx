// src/app/espacio-emprendedor/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Función para obtener device_id
function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  return localStorage.getItem(KEY) || "";
}

export default function EspacioEmprendedorPage() {
  const [participant, setParticipant] = useState<any>(null);
  const [afiliado, setAfiliado] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dni, setDni] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mis-proyectos' | 'explorar' | 'perfil'>('mis-proyectos');

  useEffect(() => {
    cargarParticipante();
  }, []);

  const cargarParticipante = async () => {
    const deviceId = getDeviceId();
    if (!deviceId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_participants')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;
      setParticipant(data || null);

      if (data) {
        await verificarAfiliacion(data.id);
      }
    } catch (err) {
      console.error('Error cargando participante:', err);
    } finally {
      setLoading(false);
    }
  };

  const verificarAfiliacion = async (participantId: string) => {
    try {
      const { data, error } = await supabase
        .from('espacio_afiliados')
        .select('*')
        .eq('participant_id', participantId)
        .maybeSingle();

      if (error) throw error;
      setAfiliado(data || null);
    } catch (err) {
      console.error('Error verificando afiliación:', err);
    }
  };

  const handleVerificarDNI = async () => {
    if (!dni.trim() || dni.length !== 8) {
      setError('Ingresa un DNI válido de 8 dígitos.');
      return;
    }

    if (!participant) {
      setError('Primero debes registrarte como participante.');
      return;
    }

    setVerificando(true);
    setError(null);

    try {
      // Simulación de verificación con JNE (en producción con API real)
      // Por ahora, simulamos una verificación exitosa
      const esAfiliado = true; // Simulación

      if (esAfiliado) {
        const { data, error } = await supabase
          .from('espacio_afiliados')
          .insert({
            participant_id: participant.id,
            dni: dni,
            verified_at: new Date().toISOString(),
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        setAfiliado(data);
        setError(null);
      } else {
        setError('No estás afiliado a Alianza para el Progreso. Puedes afiliarte en el enlace oficial del JNE.');
      }
    } catch (err: any) {
      console.error('Error verificando DNI:', err);
      setError(err.message || 'Error al verificar');
    } finally {
      setVerificando(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Cabecera */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Espacio Emprendedor APP</h1>
          <Link href="/" className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800">
            ← Volver al inicio
          </Link>
        </div>

        {/* Mensaje de bienvenida */}
        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 mb-6 shadow-sm">
          <p className="text-slate-700 text-lg font-semibold">
            💼 Conecta tu proyecto emprendedor con inversionistas. Espacio exclusivo para afiliados a Alianza para el Progreso.
          </p>
          <div className="mt-3 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> Este espacio es exclusivo para afiliados al partido. La verificación de afiliación se realiza con el JNE.
            Los proyectos presentados son de exclusiva responsabilidad de sus autores. Voto Claro no garantiza ni avala financieramente ningún proyecto.
          </div>
        </div>

        {/* Estado del participante */}
        {!participant ? (
          <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Regístrate para participar</h2>
            <p className="text-slate-600 mb-4">
              Para acceder al Espacio Emprendedor, primero debes registrarte como participante en Proyecto Ciudadano.
            </p>
            <Link
              href="/proyecto-ciudadano/registro"
              className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 inline-block"
            >
              Registrarme ahora
            </Link>
          </div>
        ) : !afiliado ? (
          <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Verificación de afiliación</h2>
            <p className="text-slate-600 mb-4">
              Para acceder al Espacio Emprendedor, debes ser afiliado a Alianza para el Progreso.
              Ingresa tu DNI para verificar tu afiliación.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <input
                type="text"
                placeholder="DNI (8 dígitos)"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                maxLength={8}
              />
              <button
                onClick={handleVerificarDNI}
                disabled={verificando}
                className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
              >
                {verificando ? 'Verificando...' : 'Verificar DNI'}
              </button>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              Si no estás afiliado, puedes hacerlo en el siguiente enlace oficial del JNE:
              <a
                href="https://www.jne.gob.pe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 ml-1 hover:underline"
              >
                https://www.jne.gob.pe
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm">
            <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Bienvenido, {participant.full_name}</h2>
                <p className="text-sm text-slate-600">DNI verificado: {afiliado.dni}</p>
                <p className="text-xs text-slate-500">Verificado el {new Date(afiliado.verified_at).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 mb-4">
              <button
                onClick={() => setActiveTab('mis-proyectos')}
                className={`px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'mis-proyectos'
                    ? 'text-green-700 border-b-2 border-green-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📝 Mis proyectos
              </button>
              <button
                onClick={() => setActiveTab('explorar')}
                className={`px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'explorar'
                    ? 'text-green-700 border-b-2 border-green-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                🔍 Explorar proyectos
              </button>
              <button
                onClick={() => setActiveTab('perfil')}
                className={`px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'perfil'
                    ? 'text-green-700 border-b-2 border-green-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                👤 Mi perfil inversionista
              </button>
            </div>

            {/* Contenido según tab */}
            {activeTab === 'mis-proyectos' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-slate-600">Tus proyectos emprendedores publicados.</p>
                  <Link
                    href="/espacio-emprendedor/nuevo-proyecto"
                    className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800"
                  >
                    + Nuevo proyecto
                  </Link>
                </div>
                <div className="bg-slate-50 rounded-xl p-8 text-center">
                  <p className="text-slate-500">Aún no tienes proyectos publicados.</p>
                  <Link
                    href="/espacio-emprendedor/nuevo-proyecto"
                    className="inline-block mt-2 text-green-700 hover:underline"
                  >
                    Crear mi primer proyecto →
                  </Link>
                </div>
              </div>
            )}

            {activeTab === 'explorar' && (
              <div>
                <p className="text-slate-600 mb-4">Explora proyectos emprendedores de otros afiliados.</p>
                <div className="bg-slate-50 rounded-xl p-8 text-center">
                  <p className="text-slate-500">Próximamente se mostrarán los proyectos disponibles.</p>
                </div>
              </div>
            )}

            {activeTab === 'perfil' && (
              <div>
                <p className="text-slate-600 mb-4">Configura tus preferencias como inversionista.</p>
                <div className="bg-slate-50 rounded-xl p-8 text-center">
                  <p className="text-slate-500">Próximamente podrás configurar tu perfil de inversionista.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}