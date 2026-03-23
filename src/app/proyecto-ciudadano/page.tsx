'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Función para obtener o crear device_id
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  console.log('🆕 Nuevo device_id creado:', newId);
  return newId;
}

export default function ProyectoCiudadanoPage() {
  const router = useRouter();
  const [participant, setParticipant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [winners, setWinners] = useState<any[]>([]);
  const [winnersLoading, setWinnersLoading] = useState(true); 

  useEffect(() => {
    const id = getOrCreateDeviceId();
    console.log('📱 device_id actual:', id);
    loadParticipant();
  }, []);
         useEffect(() => {
  // Verificar si venimos del registro exitoso
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('registered') === 'true') {
    loadParticipant();
    window.history.replaceState({}, '', '/proyecto-ciudadano');
  } else {
    loadParticipant();
  }
  
  // 👇 AGREGAR ESTA LÍNEA
  loadWinners();
}, []);
  // Función para cargar el participante por device_id
  const loadParticipant = async () => {
    const currentDeviceId = getOrCreateDeviceId();
    console.log('🔍 [ProyectoCiudadano] deviceId:', currentDeviceId);
    
    if (!currentDeviceId) {
      setParticipant(null);
      setLoading(false);
      return;
    }

    setChecking(true);
    try {
      console.log('📡 Buscando participante con deviceId:', currentDeviceId);
      const { data, error } = await supabase
        .from('project_participants')
        .select('*')
        .eq('device_id', currentDeviceId)
        .maybeSingle();

      if (error) throw error;
      console.log('✅ Participante encontrado:', data);
      setParticipant(data || null);
    } catch (err) {
      console.error('❌ Error cargando participante:', err);
      setParticipant(null);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  };
        // Cargar ganadores del ciclo anterior
const loadWinners = async () => {
  setWinnersLoading(true);
  try {
    // Obtener el ciclo anterior (el que no está activo)
    const { data: previousCycle } = await supabase
      .from('project_cycles')
      .select('id')
      .eq('is_active', false)
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!previousCycle) {
      setWinners([]);
      return;
    }

    // Obtener proyectos ganadores (los 3 con mayor puntaje final)
    const { data } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        category,
        district,
        department,
        beneficiary_count,
        leader:project_participants!leader_id (
          alias
        )
      `)
      .eq('cycle_id', previousCycle.id)
      .eq('status', 'active')
      .order('beneficiary_count', { ascending: false })
      .limit(3);

    const transformed = (data || []).map((item: any) => ({
      ...item,
      leader: item.leader && item.leader.length > 0 ? item.leader[0] : null,
    }));

    setWinners(transformed);
  } catch (err) {
    console.error('Error cargando ganadores:', err);
    setWinners([]);
  } finally {
    setWinnersLoading(false);
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
      // Buscar participante por DNI o correo
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

      // Actualizar el device_id del participante con el actual
      const currentDeviceId = getOrCreateDeviceId();
      const { error: updateError } = await supabase
        .from('project_participants')
        .update({ device_id: currentDeviceId })
        .eq('id', data.id);

      if (updateError) throw updateError;

      console.log('✅ Sesión iniciada, device_id actualizado');
      // Recargar los datos del participante
      await loadParticipant();
      setLoginIdentifier('');
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      setLoginError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoginLoading(false);
    }
  };

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

            {/* Bloque de ganadores del ciclo anterior */}
<div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl border-2 border-yellow-600 p-6 mb-6 shadow-sm">
  <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
    🏆 Ganadores del ciclo anterior
  </h2>
  {winnersLoading ? (
    <p className="text-slate-600">Cargando ganadores...</p>
  ) : winners.length === 0 ? (
    <p className="text-slate-500">Próximamente se mostrarán los proyectos ganadores.</p>
  ) : (
    <div className="space-y-3">
      {winners.map((winner, index) => (
        <div key={winner.id} className="bg-white rounded-xl p-4 shadow-sm border border-yellow-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-yellow-600">
              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
            </span>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">{winner.name}</h3>
              <p className="text-sm text-slate-600">{winner.category} • {winner.department} - {winner.district}</p>
              <p className="text-xs text-slate-500 mt-1">Líder: {winner.leader?.alias || 'Anónimo'}</p>
            </div>
            <Link
              href={`/proyecto-ciudadano/proyectos/${winner.id}`}
              className="text-sm text-green-700 hover:underline"
            >
              Ver proyecto →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
              {/* Bloque de ganadores del ciclo anterior */}
<div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl border-2 border-yellow-600 p-6 mb-6 shadow-sm">
  <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
    🏆 Ganadores del ciclo anterior
  </h2>
  {winnersLoading ? (
    <p className="text-slate-600">Cargando ganadores...</p>
  ) : winners.length === 0 ? (
    <p className="text-slate-500">Próximamente se mostrarán los proyectos ganadores.</p>
  ) : (
    <div className="space-y-3">
      {winners.map((winner, index) => (
        <div key={winner.id} className="bg-white rounded-xl p-4 shadow-sm border border-yellow-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-yellow-600">
              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
            </span>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">{winner.name}</h3>
              <p className="text-sm text-slate-600">{winner.category} • {winner.department} - {winner.district}</p>
              <p className="text-xs text-slate-500 mt-1">Líder: {winner.leader?.alias || 'Anónimo'}</p>
            </div>
            <Link
              href={`/proyecto-ciudadano/proyectos/${winner.id}`}
              className="text-sm text-green-700 hover:underline"
            >
              Ver proyecto →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
        {/* Estado del usuario */}
        {!participant ? (
          <>
            <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm mb-4">
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

            {/* Bloque de inicio de sesión para usuarios ya registrados */}
            <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-3">¿Ya tienes cuenta?</h2>
              <p className="text-slate-600 mb-4">
                Si ya te registraste anteriormente, inicia sesión con tu DNI o correo electrónico para continuar.
              </p>
              
              {loginError && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
                  {loginError}
                </div>
              )}
              
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
            </div>
          </>
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

        {/* Lista de proyectos destacados */}
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