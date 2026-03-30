'use client';
  import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

// Función para obtener o crear device_id
function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  return newId;
}

  export default function EspacioEmprendedorPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();
  const [participant, setParticipant] = useState<any>(null);
  const [afiliado, setAfiliado] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dni, setDni] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [codigoAcceso, setCodigoAcceso] = useState('');
  const [loginCodigoLoading, setLoginCodigoLoading] = useState(false);
  const [loginCodigoError, setLoginCodigoError] = useState('');
  const [topProjects, setTopProjects] = useState<any[]>([]);
  const [misProyectos, setMisProyectos] = useState<any[]>([]);
  const [mensajesRecibidos, setMensajesRecibidos] = useState<any[]>([]);
  const [cargandoMensajes, setCargandoMensajes] = useState(false);

  // Formatear fecha en hora de Perú
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-PE', { timeZone: 'America/Lima' });
  };

  useEffect(() => {
    cargarParticipante();
  }, []);

  useEffect(() => {
    if (afiliado) {
      cargarMisProyectos();
      cargarMensajesRecibidos();
    }
  }, [afiliado]);

  // Cargar proyectos destacados
  const loadTopProjects = async () => {
    try {
      const { data: contactos } = await supabase
        .from('espacio_contactos')
        .select('project_id');

      const contactCount: Record<string, number> = {};
      contactos?.forEach(c => {
        contactCount[c.project_id] = (contactCount[c.project_id] || 0) + 1;
      });

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
      const { data, error } = await supabase
        .from('project_participants')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;
      setParticipant(data || null);

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

  // Cargar proyectos del emprendedor
  const cargarMisProyectos = async () => {
    if (!afiliado) {
      console.log('⚠️ No hay afiliado, no se cargan proyectos');
      return;
    }
    console.log('🔍 Cargando proyectos para owner_id:', afiliado.id);
    try {
      const { data } = await supabase
        .from('espacio_proyectos')
        .select('id, title, category, department, district, views, status, created_at')
        .eq('owner_id', afiliado.id)
        .order('created_at', { ascending: false });
      
      console.log('📦 Proyectos encontrados:', data?.length || 0);
      
      const { data: contactos } = await supabase
        .from('espacio_contactos')
        .select('project_id');
      
      const contactCount: Record<string, number> = {};
      contactos?.forEach(c => {
        contactCount[c.project_id] = (contactCount[c.project_id] || 0) + 1;
      });

      const proyectosConContactos = (data || []).map(p => ({
        ...p,
        contactos: contactCount[p.id] || 0
      }));
      
      setMisProyectos(proyectosConContactos);
    } catch (err) {
      console.error('Error cargando mis proyectos:', err);
    }
  };

  // Cargar mensajes recibidos por el emprendedor
  const cargarMensajesRecibidos = async () => {
    if (!participant) return;
    setCargandoMensajes(true);
    try {
      const { data: proyectosDelEmprendedor } = await supabase
        .from('espacio_proyectos')
        .select('id, title')
        .eq('owner_id', afiliado?.id);

      if (!proyectosDelEmprendedor?.length) {
        setMensajesRecibidos([]);
        setCargandoMensajes(false);
        return;
      }

      const projectIds = proyectosDelEmprendedor.map(p => p.id);
      
      // Obtener todos los mensajes de los proyectos
      const { data: mensajes } = await supabase
        .from('espacio_mensajes')
        .select('*')
        .in('proyecto_id', projectIds)
        .order('created_at', { ascending: false });

      if (!mensajes) {
        setMensajesRecibidos([]);
        return;
      }

      // Para cada mensaje, obtener el nombre del remitente
      const mensajesConNombres = await Promise.all(
        mensajes.map(async (msg) => {
          let remitente = 'Usuario';
          const proyecto = proyectosDelEmprendedor.find(p => p.id === msg.proyecto_id);

          if (msg.sender_type === 'inversionista' && msg.sender_participant_id) {
            const { data: participante } = await supabase
              .from('project_participants')
              .select('full_name')
              .eq('id', msg.sender_participant_id)
              .maybeSingle();
            remitente = participante?.full_name || 'Inversionista';
          } else if (msg.sender_type === 'emprendedor' && msg.sender_afiliado_id) {
            const { data: afiliadoData } = await supabase
              .from('espacio_afiliados')
              .select('participant_id')
              .eq('id', msg.sender_afiliado_id)
              .maybeSingle();
            if (afiliadoData?.participant_id) {
              const { data: participante } = await supabase
                .from('project_participants')
                .select('full_name')
                .eq('id', afiliadoData.participant_id)
                .maybeSingle();
              remitente = participante?.full_name || 'Emprendedor';
            } else {
              remitente = 'Emprendedor';
            }
          }

          return {
            id: msg.id,
            mensaje: msg.content,
            remitente: remitente,
            remitente_id: msg.sender_type === 'inversionista' ? msg.sender_participant_id : msg.sender_afiliado_id,
            proyecto_titulo: proyecto?.title || 'Proyecto',
            proyecto_id: msg.proyecto_id,
            created_at: msg.created_at,
            sender_type: msg.sender_type,
          };
        })
      );

      setMensajesRecibidos(mensajesConNombres);
    } catch (err) {
      console.error('Error cargando mensajes recibidos:', err);
    } finally {
      setCargandoMensajes(false);
    }
  };

  // Suscripción en tiempo real para nuevos mensajes
  useEffect(() => {
    if (!afiliado || misProyectos.length === 0) return;

    const projectIds = misProyectos.map(p => p.id);
    if (projectIds.length === 0) return;

    console.log('🔌 Configurando suscripción para proyectos:', projectIds);

    const channel = supabase
      .channel('mensajes-emprendedor')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'espacio_mensajes',
          filter: `proyecto_id=in.(${projectIds.join(',')})`,
        },
        () => {
          console.log('📨 Nuevo mensaje recibido en algún proyecto. Recargando...');
          cargarMensajesRecibidos();
        }
      )
      .subscribe((status) => {
        console.log('🔌 Estado suscripción (mensajes-emprendedor):', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Suscripción activa para proyectos del emprendedor');
        }
      });

    return () => {
      console.log('🔌 Limpiando suscripción');
      supabase.removeChannel(channel);
    };
  }, [afiliado, misProyectos]);

  // Responder mensaje (navega al proyecto)
  const responderMensaje = (proyectoId: string, remitenteId: string) => {
    router.push(`/espacio-emprendedor/proyectos/${proyectoId}?destinatario=${remitenteId}`);
  };

  // Función para iniciar sesión con código de acceso
  const handleLoginConCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginCodigoLoading(true);
    setLoginCodigoError('');

    const codigo = codigoAcceso.trim().toUpperCase();
    console.log('🔍 Código ingresado:', codigo);
    
    if (!codigo) {
      setLoginCodigoError('Ingresa tu código de acceso');
      setLoginCodigoLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_participants')
        .select('*')
        .eq('codigo_acceso', codigo)
        .maybeSingle();

      console.log('🔍 Buscando código:', codigo);
      console.log('📦 Resultado:', data);

      if (error) throw error;
      
      if (!data) {
        setLoginCodigoError('Código de acceso no válido');
        setLoginCodigoLoading(false);
        return;
      }

      const currentDeviceId = getDeviceId();
      const { error: updateError } = await supabase
        .from('project_participants')
        .update({ device_id: currentDeviceId })
        .eq('id', data.id);

      if (updateError) throw updateError;

      await cargarParticipante();
      setCodigoAcceso('');
      setLoginCodigoError('✅ Sesión iniciada correctamente');
      setTimeout(() => setLoginCodigoError(''), 3000);
    } catch (err: any) {
      console.error('Error al iniciar sesión con código:', err);
      setLoginCodigoError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoginCodigoLoading(false);
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
      const { data: afiliadoExistente, error: afiliadoError } = await supabase
        .from('espacio_afiliados')
        .select('*')
        .eq('dni', dni)
        .eq('is_active', true)
        .maybeSingle();

      if (afiliadoError) throw afiliadoError;

      if (!afiliadoExistente) {
        setError('No estás afiliado a Alianza para el Progreso. Para presentar un proyecto, primero debes afiliarte en el enlace oficial del JNE.');
        setVerificando(false);
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .from('espacio_afiliados')
        .select('*')
        .eq('participant_id', participant.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        setAfiliado(existing);
        await cargarParticipante();
        setSuccessMsg('✅ Ya estás verificado como afiliado. ¡Bienvenido al Espacio Emprendedor!');
        setTimeout(() => setSuccessMsg(null), 3000);
        setVerificando(false);
        return;
      }

      const { data: updatedAfiliado, error: updateError } = await supabase
        .from('espacio_afiliados')
        .update({ 
          participant_id: participant.id,
          verified_at: new Date().toISOString()
        })
        .eq('id', afiliadoExistente.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setAfiliado(updatedAfiliado);
      await cargarParticipante();
      setSuccessMsg('✅ DNI verificado correctamente. ¡Bienvenido al Espacio Emprendedor!');
      setTimeout(() => setSuccessMsg(null), 3000);

    } catch (err: any) {
      console.error('Error verificando DNI:', err);
      setError(err.message || 'Error al verificar afiliación');
    } finally {
      setVerificando(false);
    }
  };
        useEffect(() => {
    const topTitles = topProjects
      .slice(0, 3)
      .map((p) => p?.title)
      .filter(Boolean);

    const lastMessageProject =
      mensajesRecibidos.length > 0 ? mensajesRecibidos[0]?.proyecto_titulo || '' : '';

    const visibleParts: string[] = [];

    if (loading) {
      visibleParts.push('La pantalla está cargando datos del Espacio Emprendedor.');
    }

    if (!participant && !loading) {
      visibleParts.push('Se muestra registro para participar e inicio de sesión con código.');
    }

    if (participant && !afiliado) {
      visibleParts.push('El usuario ya es participante, pero todavía no está verificado como afiliado.');
      visibleParts.push('Se muestra el formulario para verificar DNI.');
    }

    if (participant && afiliado) {
      visibleParts.push('El usuario ya está verificado como emprendedor.');
      visibleParts.push('Se muestran sus proyectos y mensajes recibidos.');
    }

    if (topTitles.length) {
      visibleParts.push(`Proyectos destacados visibles: ${topTitles.join(', ')}.`);
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}`);
    }

    if (successMsg) {
      visibleParts.push(`Mensaje de éxito visible: ${successMsg}`);
    }

    if (loginCodigoError) {
      visibleParts.push(`Mensaje visible de acceso: ${loginCodigoError}`);
    }

    if (cargandoMensajes) {
      visibleParts.push('La bandeja de mensajes está cargando.');
    }

    if (lastMessageProject) {
      visibleParts.push(`Último proyecto con mensaje visible: ${lastMessageProject}.`);
    }

    const activeSection = !participant
      ? 'registro-o-login'
      : !afiliado
      ? 'verificacion-dni'
      : 'panel-emprendedor';

    const availableActions = !participant
      ? ['Registrarme ahora', 'Iniciar sesión con código']
      : !afiliado
      ? ['Verificar DNI', 'Afiliarme en JNE']
      : ['Publicar nuevo proyecto', 'Ver detalles de proyecto', 'Responder mensajes'];

    const summary = !participant
      ? 'Pantalla de acceso al Espacio Emprendedor para registro o ingreso con código.'
      : !afiliado
      ? 'Pantalla de verificación de afiliación para habilitar publicación de proyectos.'
      : 'Panel del emprendedor con proyectos propios y mensajes recibidos.';

    const status =
      loading ? 'loading' : error ? 'error' : 'ready';

    setPageContext({
      pageId: 'espacio-emprendedor',
      pageTitle: 'Espacio Emprendedor',
      route: '/espacio-emprendedor',
      summary,
      activeSection,
      visibleText: visibleParts.join('\n'),
      availableActions,
      selectedItemTitle: lastMessageProject || undefined,
      status,
      dynamicData: {
        participantLogueado: !!participant,
        afiliadoVerificado: !!afiliado,
        proyectosDestacadosCount: topProjects.length,
        misProyectosCount: misProyectos.length,
        mensajesRecibidosCount: mensajesRecibidos.length,
        cargandoMensajes,
        loginCodigoLoading,
        verificandoDni: verificando,
      },
    });
  }, [
    setPageContext,
    loading,
    participant,
    afiliado,
    topProjects,
    misProyectos,
    mensajesRecibidos,
    cargandoMensajes,
    loginCodigoLoading,
    verificando,
    error,
    successMsg,
    loginCodigoError,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);
  // Estilos con animaciones
  const card = "rounded-2xl border-2 border-red-600 p-6 shadow-sm vc-fade-up vc-card-hover";
  const btnPrimary = "bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition vc-btn-wave vc-btn-pulse";
  const btnSecondary = "bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition vc-btn-wave vc-btn-pulse";
  const btnOutline = "bg-slate-200 text-slate-800 px-4 py-2 rounded-xl font-semibold hover:bg-slate-300 transition text-center vc-btn-wave vc-btn-pulse";
  const inputStyle = "w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none";

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
        <div className="flex justify-between items-center mb-6 vc-fade-up">
          <h1 className="text-3xl font-bold text-slate-900">Espacio Emprendedor APP</h1>
          <Link href="/" className={btnPrimary}>
            ← Volver al inicio
          </Link>
        </div>

        {/* Mensajes de éxito y error */}
        {successMsg && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl text-sm vc-slide-in">
            {successMsg}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm vc-slide-in">
            {error}
          </div>
        )}

        {/* Mensaje de bienvenida */}
        <div className={`bg-white ${card}`}>
          <p className="text-slate-700 text-lg font-semibold">
            💼 Conecta tu proyecto emprendedor con inversionistas.
          </p>
          <div className="mt-3 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> Los proyectos presentados son de exclusiva responsabilidad de sus autores. 
            Voto Claro no garantiza ni avala financieramente ningún proyecto.
          </div>
        </div>

        {/* Proyectos destacados */}
        <div className={`bg-white ${card} mt-6`}>
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="text-2xl">📞</span> Proyectos más contactados
          </h2>
          <div className="space-y-3">
            {topProjects.length === 0 ? (
              <p className="text-slate-500 text-sm">Aún no hay proyectos contactados.</p>
            ) : (
              topProjects.map((project, index) => (
                <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl vc-card-hover">
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
            <div className={`bg-white ${card} mt-6`}>
              <h2 className="text-xl font-bold text-slate-900 mb-3">Regístrate para participar</h2>
              <p className="text-slate-600 mb-4">
                Para acceder al Espacio Emprendedor, primero debes registrarte como participante.
              </p>
              <Link
                href="/proyecto-ciudadano/registro?returnTo=espacio-emprendedor"
                className={btnPrimary}
              >
                Registrarme ahora
              </Link>
            </div>

            {/* Inicio de sesión con código */}
            <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm mt-6 vc-fade-up vc-delay-1">
              <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="text-2xl">🔑</span> Iniciar sesión con código
              </h2>
              <p className="text-slate-600 mb-4 text-sm">
                Si ya tienes un código de acceso (el que te dieron al registrarte), ingrésalo aquí.
              </p>
              
              {loginCodigoError && (
                <div className="mb-4 p-3 rounded-xl text-sm" style={{
                  backgroundColor: loginCodigoError.includes('✅') ? '#f0fdf4' : '#fee2e2',
                  border: loginCodigoError.includes('✅') ? '1px solid #bbf7d0' : '1px solid #fecaca',
                  color: loginCodigoError.includes('✅') ? '#166534' : '#dc2626'
                }}>
                  {loginCodigoError}
                </div>
              )}
              
              <form onSubmit={handleLoginConCodigo} className="space-y-3">
                <input
                  type="text"
                  placeholder="Ej: EMP-2026-3A7F"
                  value={codigoAcceso}
                  onChange={(e) => {
                    console.log('✏️ Input cambiado:', e.target.value);
                    setCodigoAcceso(e.target.value.toUpperCase());
                  }}
                  className={inputStyle}
                  disabled={loginCodigoLoading}
                />
                <button
                  type="submit"
                  disabled={loginCodigoLoading}
                  className="w-full bg-blue-700 text-white py-2 rounded-xl font-semibold hover:bg-blue-800 transition disabled:opacity-50 vc-btn-wave vc-btn-pulse"
                >
                  {loginCodigoLoading ? 'Verificando...' : 'Iniciar sesión con código'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Bloque para Emprendedores (requiere afiliación) */}
            <div className={`bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm vc-fade-up`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">💼</span>
                <h2 className="text-xl font-bold text-slate-900">Como Emprendedor</h2>
              </div>
              
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
                      className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 disabled:opacity-50 vc-btn-wave vc-btn-pulse"
                    >
                      {verificando ? 'Verificando...' : 'Verificar DNI'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    ¿No estás afiliado? <a href="https://www.jne.gob.pe" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">Afíliate aquí</a>
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-green-700 bg-green-50 p-2 rounded-lg mb-3">
                      ✅ DNI verificado. ¡Bienvenido, emprendedor!
                    </p>
                    <Link
                      href="/espacio-emprendedor/nuevo-proyecto"
                      className="inline-block bg-green-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-800 vc-btn-wave vc-btn-pulse"
                    >
                      + Publicar nuevo proyecto
                    </Link>
                  </div>

                  {/* Mis proyectos */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span>📋</span> Mis proyectos
                    </h3>
                    {misProyectos.length === 0 ? (
                      <p className="text-slate-500 text-sm">Aún no has publicado proyectos.</p>
                    ) : (
                      <div className="space-y-3">
                        {misProyectos.map((proyecto) => (
                          <div key={proyecto.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 vc-card-hover">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold text-slate-800">{proyecto.title}</h4>
                                <p className="text-xs text-slate-500">
                                  {proyecto.category} • {proyecto.department} - {proyecto.district}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  👁️ {proyecto.views || 0} vistas • 📩 {proyecto.contactos || 0} contactos
                                </p>
                              </div>
                              <Link
                                href={`/espacio-emprendedor/proyectos/${proyecto.id}`}
                                className="text-sm text-green-700 hover:underline"
                              >
                                Ver detalles →
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Mensajes recibidos */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span>💬</span> Mensajes recibidos
                    </h3>
                    {cargandoMensajes ? (
                      <p className="text-slate-500 text-sm">Cargando mensajes...</p>
                    ) : mensajesRecibidos.length === 0 ? (
                      <p className="text-slate-500 text-sm">No tienes mensajes nuevos.</p>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {mensajesRecibidos.map((msg) => (
                          <div key={msg.id} className="bg-slate-50 rounded-xl p-3 border-l-4 border-green-500 vc-card-hover">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-slate-800">{msg.remitente}</p>
                                  <span className="text-xs text-slate-400">
                                    {formatDate(msg.created_at)}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">Proyecto: {msg.proyecto_titulo}</p>
                                <p className="text-sm text-slate-700 mt-2">{msg.mensaje}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => responderMensaje(msg.proyecto_id, msg.remitente_id)}
                              className="mt-2 text-xs text-green-700 hover:underline vc-btn-wave"
                            >
                              Responder →
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bloque para Inversionistas (sin restricción de afiliación) */}
            <div className={`bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm vc-fade-up vc-delay-1`}>
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
                  className={btnSecondary + " text-center"}
                >
                  🔍 Explorar proyectos
                </Link>
                <Link
                  href="/espacio-emprendedor/perfil-inversionista"
                  className={btnOutline}
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