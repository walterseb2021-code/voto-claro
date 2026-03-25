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
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [topProjects, setTopProjects] = useState<any[]>([]);

  useEffect(() => {
    cargarParticipante();
  }, []);
       // Cargar proyectos destacados
    // Cargar proyectos más contactados
const loadTopProjects = async () => {
  try {
    // Contar contactos por proyecto
    const { data: contactos } = await supabase
      .from('espacio_contactos')
      .select('project_id');

    const contactCount: Record<string, number> = {};
    contactos?.forEach(c => {
      contactCount[c.project_id] = (contactCount[c.project_id] || 0) + 1;
    });

    // Obtener proyectos ordenados por contactos
    const { data: proyectos } = await supabase
      .from('espacio_proyectos')
      .select('id, title, category, department')
      .eq('status', 'active');

    const proyectosConContactos = (proyectos || []).map(p => ({
      ...p,
      contactos: contactCount[p.id] || 0
    }));

    proyectosConContactos.sort((a, b) => b.contactos - a.contactos);
    setTopProjects(proyectosConContactos.slice(0, 3));
  } catch (err) {
    console.error('Error cargando proyectos destacados:', err);
  }
};

useEffect(() => {
  loadTopProjects();
}, []);
     const cargarParticipante = async () => {
  const deviceId = getDeviceId();
  if (!deviceId) {
    setLoading(false);
    return;
  }

  setLoading(true);
  try {
    // Cargar participante
    const { data, error } = await supabase
      .from('project_participants')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) throw error;
    setParticipant(data || null);

    // Cargar afiliación si existe
    if (data) {
      const { data: afiliadoData } = await supabase
        .from('espacio_afiliados')
        .select('*')
        .eq('participant_id', data.id)
        .maybeSingle();
      setAfiliado(afiliadoData || null);
    } else {
      setAfiliado(null);
    }
  } catch (err) {
    console.error('Error cargando participante:', err);
  } finally {
    setLoading(false);
  }
};
  // Función para iniciar sesión con DNI o correo
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    const identifier = loginIdentifier.trim();
    if (!identifier) {
      setLoginError('Ingresa tu DNI o correo electrónico');
      setLoginLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_participants')
        .select('*')
        .or(`dni.eq.${identifier},email.eq.${identifier}`)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        setLoginError('No se encontró un participante con esos datos. ¿Ya te registraste?');
        setLoginLoading(false);
        return;
      }

      const currentDeviceId = getDeviceId();
      const { error: updateError } = await supabase
        .from('project_participants')
        .update({ device_id: currentDeviceId })
        .eq('id', data.id);

      if (updateError) throw updateError;

      await cargarParticipante();
      setLoginIdentifier('');
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      setLoginError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoginLoading(false);
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
    // 1. Verificar si ya existe afiliación
    const { data: existing, error: existingError } = await supabase
      .from('espacio_afiliados')
      .select('*')
      .eq('participant_id', participant.id)
      .maybeSingle();

    if (existingError) throw existingError;

    // 2. Si ya existe, actualizar estado y recargar
    if (existing) {
      setAfiliado(existing);
      // 🔄 FORZAR RECARGA DE DATOS COMPLETOS
      await cargarParticipante();
      setError(null);
      alert('✅ Ya estás verificado como afiliado. ¡Bienvenido al Espacio Emprendedor!');
      setVerificando(false);
      return;
    }

    // 3. Simulación de verificación (siempre true)
    const esAfiliado = true;

    if (esAfiliado) {
      // 4. Insertar nueva afiliación
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
      // 🔄 FORZAR RECARGA DE DATOS COMPLETOS
      await cargarParticipante();
      setError(null);
      alert('✅ DNI verificado correctamente. ¡Bienvenido al Espacio Emprendedor!');
    } else {
      setError('No estás afiliado a Alianza para el Progreso. Puedes afiliarte en el enlace oficial del JNE.');
    }
  } catch (err: any) {
    console.error('Error verificando DNI:', err);
    if (err.message?.includes('duplicate key')) {
      setError('Ya existe una verificación para este DNI. Recargando datos...');
      // Intentar recargar datos
      await cargarParticipante();
    } else {
      setError(err.message || 'Error al verificar');
    }
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
            💼 Conecta tu proyecto emprendedor con inversionistas.
          </p>
          <div className="mt-3 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> Los proyectos presentados son de exclusiva responsabilidad de sus autores. 
            Voto Claro no garantiza ni avala financieramente ningún proyecto.
          </div>
        </div>
                {/* Proyectos destacados */}
<div className="bg-white rounded-2xl border-2 border-red-600 p-6 mb-6 shadow-sm">
    <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
  <span className="text-2xl">📞</span> Proyectos más contactados
</h2>
  <div className="space-y-3">
    {topProjects.length === 0 ? (
      <p className="text-slate-500 text-sm">Aún no hay proyectos contactados.</p>
    ) : (
      topProjects.map((project, index) => (
        <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-green-600 w-8">
              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
            </span>
            <div>
              <p className="font-semibold text-slate-800">{project.title}</p>
              <p className="text-xs text-slate-500">{project.category} • {project.department}</p>
            </div>
          </div>
          <div className="text-right">
              <p className="font-bold text-green-600">{project.contactos || 0} contactos</p>
            <Link href={`/espacio-emprendedor/proyectos/${project.id}`} className="text-xs text-green-700 hover:underline">
              Ver proyecto →
            </Link>
          </div>
        </div>
      ))
    )}
  </div>
</div>
        {/* Estado del participante */}
        {!participant ? (
          <>
            <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm mb-4">
              <h2 className="text-xl font-bold text-slate-900 mb-3">Regístrate para participar</h2>
              <p className="text-slate-600 mb-4">
                Para acceder al Espacio Emprendedor, primero debes registrarte como participante.
              </p>
              <Link
                href="/proyecto-ciudadano/registro?returnTo=espacio-emprendedor"
                className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 inline-block"
              >
                Registrarme ahora
              </Link>
            </div>

            <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-3">¿Ya tienes cuenta?</h2>
              <p className="text-slate-600 mb-4">
                Si ya te registraste anteriormente, inicia sesión con tu DNI o correo electrónico.
              </p>
              
              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  type="text"
                  placeholder="DNI o correo electrónico"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  disabled={loginLoading}
                />
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-slate-200 text-slate-800 py-2 rounded-xl font-semibold hover:bg-slate-300 transition disabled:opacity-50"
                >
                  {loginLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </button>
              </form>
              {loginError && (
                <div className="mt-3 text-sm text-red-600">{loginError}</div>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bloque para Emprendedores (requiere afiliación) */}
            <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">💼</span>
                <h2 className="text-xl font-bold text-slate-900">Como Emprendedor</h2>
              </div>
              <p className="text-slate-600 mb-4">
                Publica tu proyecto y busca inversionistas. Este espacio es exclusivo para afiliados a Alianza para el Progreso.
              </p>
              
              {!afiliado ? (
                <div>
                  <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded-lg mb-3">
                    Para publicar proyectos, debes ser afiliado a Alianza para el Progreso.
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="DNI (8 dígitos)"
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      className="flex-1 border-2 border-slate-300 rounded-xl px-3 py-2 text-sm"
                      maxLength={8}
                    />
                    <button
                      onClick={handleVerificarDNI}
                      disabled={verificando}
                      className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 disabled:opacity-50"
                    >
                      {verificando ? 'Verificando...' : 'Verificar DNI'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    ¿No estás afiliado? <a href="https://www.jne.gob.pe" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">Afíliate aquí</a>
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-green-700 bg-green-50 p-2 rounded-lg mb-3">
                    ✅ DNI verificado. ¡Bienvenido, emprendedor!
                  </p>
                  <Link
                    href="/espacio-emprendedor/nuevo-proyecto"
                    className="inline-block bg-green-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-800"
                  >
                    + Publicar proyecto
                  </Link>
                </div>
              )}
            </div>

            {/* Bloque para Inversionistas (sin restricción de afiliación) */}
            <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">💰</span>
                <h2 className="text-xl font-bold text-slate-900">Como Inversionista</h2>
              </div>
              <p className="text-slate-600 mb-4">
                Explora proyectos, contacta emprendedores y configura tus preferencias para recibir notificaciones.
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/espacio-emprendedor/explorar"
                  className="bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-blue-800 text-center"
                >
                  🔍 Explorar proyectos
                </Link>
                <Link
                  href="/espacio-emprendedor/perfil-inversionista"
                  className="bg-slate-200 text-slate-800 px-4 py-2 rounded-xl font-semibold hover:bg-slate-300 text-center"
                >
                  ⚙️ Configurar mi perfil
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}