// src/app/proyecto-ciudadano/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ProyectoCiudadanoPage() {
  const router = useRouter();
  const [participant, setParticipant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // Función para cargar el participante por device_id
  const loadParticipant = async () => {
    const deviceId = localStorage.getItem('vc_device_id');
    if (!deviceId) {
      setParticipant(null);
      setLoading(false);
      return;
    }

    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('project_participants')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;
      setParticipant(data || null);
    } catch (err) {
      console.error('Error cargando participante:', err);
      setParticipant(null);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParticipant();
  }, []);

  // Forzar recarga manual
  const handleRefresh = () => {
    setLoading(true);
    loadParticipant();
  };

  if (loading || checking) {
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
          <h1 className="text-3xl font-bold text-slate-900">Proyecto Ciudadano</h1>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition"
            >
              🔄 Recargar
            </button>
            <Link href="/" className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800">
              ← Volver al inicio
            </Link>
          </div>
        </div>

        {/* Mensaje de bienvenida */}
        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 mb-6 shadow-sm">
          <p className="text-slate-700 text-lg font-semibold">
            💡 Convierte tus ideas en acción. Presenta un proyecto para tu comunidad, forma un equipo y recibe apoyo vecinal.
            Los mejores proyectos serán reconocidos con premios económicos en un evento oficial cada 3 meses.
          </p>
        </div>

        {/* Estado del usuario */}
        {!participant ? (
          <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Regístrate para participar</h2>
            <p className="text-slate-600 mb-4">
              Completa tu perfil para poder presentar proyectos o apoyar iniciativas ciudadanas.
            </p>
            <Link
              href="/proyecto-ciudadano/registro"
              className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 inline-block"
            >
              Registrarme ahora
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm">
            <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Bienvenido, {participant.full_name}</h2>
                <p className="text-sm text-slate-600">Alias: {participant.alias}</p>
                <p className="text-xs text-slate-500 mt-1">Registrado el {new Date(participant.created_at).toLocaleDateString()}</p>
              </div>
              <button
                onClick={handleRefresh}
                className="text-sm text-green-700 hover:text-green-800 font-semibold"
              >
                ↻ Actualizar datos
              </button>
            </div>
            
            <p className="text-slate-600 mb-4">
              Puedes presentar un nuevo proyecto o apoyar iniciativas existentes.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Link
                href="/proyecto-ciudadano/nuevo-proyecto"
                className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 inline-block"
              >
                📝 Presentar proyecto
              </Link>
              <Link
                href="/proyecto-ciudadano/proyectos"
                className="bg-slate-200 text-slate-800 px-6 py-2 rounded-xl font-semibold hover:bg-slate-300 inline-block"
              >
                🔍 Ver proyectos activos
              </Link>
            </div>
          </div>
        )}

        {/* Lista de proyectos destacados (próximamente) */}
        <div className="mt-6 bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-3">Proyectos destacados</h2>
          <p className="text-slate-500">Próximamente se mostrarán los proyectos con más apoyo ciudadano.</p>
          <Link
            href="/proyecto-ciudadano/proyectos"
            className="inline-block mt-3 text-green-700 hover:text-green-800 font-semibold"
          >
            Ver todos los proyectos →
          </Link>
        </div>
      </div>
    </main>
  );
}