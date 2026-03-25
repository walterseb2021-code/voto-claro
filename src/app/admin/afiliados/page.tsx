// src/app/admin/afiliados/page.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Afiliado = {
  id: string;
  participant_id: string;
  dni: string;
  verified_at: string;
  is_active: boolean;
  created_at: string;
  participante?: {
    full_name: string;
    email: string;
  };
};

export default function AdminAfiliadosPage() {
  const [afiliados, setAfiliados] = useState<Afiliado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nuevoDni, setNuevoDni] = useState('');
  const [buscarDni, setBuscarDni] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [participantes, setParticipantes] = useState<any[]>([]);

  useEffect(() => {
    cargarAfiliados();
    cargarParticipantes();
  }, []);

  const cargarAfiliados = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('espacio_afiliados')
        .select(`
          id,
          participant_id,
          dni,
          verified_at,
          is_active,
          created_at,
          participante:project_participants!participant_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (buscarDni) {
        query = query.ilike('dni', `%${buscarDni}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transformed = (data || []).map((item: any) => ({
        ...item,
        participante: item.participante?.[0] || null,
      }));

      setAfiliados(transformed);
    } catch (err: any) {
      console.error('Error cargando afiliados:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cargarParticipantes = async () => {
    try {
      const { data } = await supabase
        .from('project_participants')
        .select('id, full_name, dni, email')
        .order('full_name');
      setParticipantes(data || []);
    } catch (err) {
      console.error('Error cargando participantes:', err);
    }
  };

  const agregarAfiliado = async () => {
    if (!nuevoDni.trim() || nuevoDni.length !== 8) {
      setMessage('❌ Ingresa un DNI válido de 8 dígitos.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setAgregando(true);
    setMessage(null);

    try {
      // Buscar participante con ese DNI
      const { data: participante } = await supabase
        .from('project_participants')
        .select('id, full_name')
        .eq('dni', nuevoDni)
        .maybeSingle();

      if (!participante) {
        setMessage(`❌ No existe un participante con DNI ${nuevoDni}. Primero debe registrarse.`);
        setAgregando(false);
        return;
      }

      // Verificar si ya está afiliado
      const { data: existing } = await supabase
        .from('espacio_afiliados')
        .select('id')
        .eq('participant_id', participante.id)
        .maybeSingle();

      if (existing) {
        setMessage(`⚠️ El DNI ${nuevoDni} ya está registrado como afiliado.`);
        setAgregando(false);
        return;
      }

      // Insertar afiliado
      const { error } = await supabase
        .from('espacio_afiliados')
        .insert({
          participant_id: participante.id,
          dni: nuevoDni,
          verified_at: new Date().toISOString(),
          is_active: true,
        });

      if (error) throw error;

      setMessage(`✅ Afiliado agregado correctamente: ${participante.full_name} (DNI: ${nuevoDni})`);
      setNuevoDni('');
      cargarAfiliados();
    } catch (err: any) {
      console.error('Error agregando afiliado:', err);
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setAgregando(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const eliminarAfiliado = async (id: string, dni: string) => {
    if (!confirm(`¿Eliminar afiliado con DNI ${dni}?`)) return;

    try {
      const { error } = await supabase
        .from('espacio_afiliados')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMessage(`✅ Afiliado con DNI ${dni} eliminado.`);
      cargarAfiliados();
    } catch (err: any) {
      console.error('Error eliminando afiliado:', err);
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Admin - Gestión de Afiliados APP</h1>
          <Link href="/admin" className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300">
            ← Volver al Admin
          </Link>
        </div>

        {/* Mensajes */}
        {message && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${
            message.includes('✅') ? 'bg-green-100 text-green-800 border border-green-300' : 
            message.includes('⚠️') ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
            'bg-red-100 text-red-800 border border-red-300'
          }`}>
            {message}
          </div>
        )}

        {/* Panel de simulación */}
        <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="text-2xl">🔧</span> Modo Simulación
          </h2>
          <p className="text-slate-600 mb-3">
            Actualmente, cualquier DNI ingresado en el bloque "Emprendedor" será aceptado automáticamente.
            Esto permite probar la funcionalidad mientras esperamos la API oficial del JNE.
          </p>
          <div className="bg-blue-50 p-3 rounded-xl text-sm text-blue-800">
            <strong>ℹ️ Información:</strong> La verificación real con el JNE estará disponible cuando se habilite su API oficial (prevista para abril 2026).
          </div>
        </div>

        {/* Agregar afiliado manualmente */}
        <div className="bg-white rounded-2xl border-2 border-green-600 p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="text-2xl">➕</span> Agregar afiliado manualmente
          </h2>
          <p className="text-slate-600 mb-4">
            Ingresa el DNI de un participante registrado para marcarlo como afiliado a APP.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="DNI (8 dígitos)"
              value={nuevoDni}
              onChange={(e) => setNuevoDni(e.target.value)}
              className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              maxLength={8}
            />
            <button
              onClick={agregarAfiliado}
              disabled={agregando}
              className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
            >
              {agregando ? 'Agregando...' : 'Agregar afiliado'}
            </button>
          </div>
        </div>

        {/* Buscador y lista de afiliados */}
        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h2 className="text-xl font-bold text-slate-900">Lista de afiliados</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar por DNI..."
                value={buscarDni}
                onChange={(e) => setBuscarDni(e.target.value)}
                className="border-2 border-slate-300 rounded-xl px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={cargarAfiliados}
                className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300"
              >
                Buscar
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-slate-600">Cargando...</p>
          ) : error ? (
            <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4">{error}</div>
          ) : afiliados.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No hay afiliados registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3 text-left">DNI</th>
                    <th className="p-3 text-left">Nombre</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Verificado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {afiliados.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-slate-50">
                      <td className="p-3 font-mono">{a.dni}</td>
                      <td className="p-3">{a.participante?.full_name || '-'}</td>
                      <td className="p-3">{a.participante?.email || '-'}</td>
                      <td className="p-3">{new Date(a.verified_at).toLocaleDateString()}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => eliminarAfiliado(a.id, a.dni)}
                          className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-700"
                        >
                          Eliminar
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