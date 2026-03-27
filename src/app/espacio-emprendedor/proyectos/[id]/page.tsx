'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Project = {
  id: string;
  title: string;
  category: string;
  summary: string;
  department: string;
  province: string;
  district: string;
  investment_min: number;
  investment_max: number;
  pdf_url: string;
  owner_id: string;
  status: string;
  views: number;
  created_at: string;
  owner: {
    id: string;
    nombres_completos: string;
    email: string;
    celular: string;
  } | null;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_type: string;
  sender_afiliado_id: string | null;
  sender_participant_id: string | null;
  remitente_nombre: string;
};

export default function EspacioEmprendedorProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [afiliadoId, setAfiliadoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [esPropietario, setEsPropietario] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('Conectando...');

  // Formatear fecha en hora de Perú
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-PE', { timeZone: 'America/Lima' });
  };

  // Función para obtener el nombre del remitente
  async function obtenerNombreRemitente(senderType: string, afiliadoId: string | null, participanteId: string | null): Promise<string> {
    if (senderType === 'emprendedor' && afiliadoId) {
      const { data: afiliado } = await supabase
        .from('espacio_afiliados')
        .select('participant_id')
        .eq('id', afiliadoId)
        .maybeSingle();
      if (afiliado?.participant_id) {
        const { data: participante } = await supabase
          .from('project_participants')
          .select('full_name')
          .eq('id', afiliado.participant_id)
          .maybeSingle();
        return participante?.full_name || 'Emprendedor';
      }
      return 'Emprendedor';
    } else if (senderType === 'inversionista' && participanteId) {
      const { data: participante } = await supabase
        .from('project_participants')
        .select('full_name')
        .eq('id', participanteId)
        .maybeSingle();
      return participante?.full_name || 'Inversionista';
    }
    return 'Usuario';
  }

  // Función para cargar mensajes
  async function cargarMensajes() {
    console.log('🔄 Cargando mensajes para proyecto:', projectId);
    const { data: messagesData, error } = await supabase
      .from('espacio_mensajes')
      .select('*')
      .eq('proyecto_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error cargando mensajes:', error);
      return;
    }

    const mensajesConNombres = await Promise.all(
      (messagesData || []).map(async (msg: any) => {
        const nombre = await obtenerNombreRemitente(
          msg.sender_type,
          msg.sender_afiliado_id,
          msg.sender_participant_id
        );
        return {
          ...msg,
          remitente_nombre: nombre,
        };
      })
    );

    setMessages(mensajesConNombres);
    console.log('✅ Mensajes cargados:', mensajesConNombres.length);
  }

  // Cargar datos iniciales
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const deviceId = localStorage.getItem('vc_device_id');
        let currentParticipant = null;
        if (deviceId) {
          const { data: pData } = await supabase
            .from('project_participants')
            .select('*')
            .eq('device_id', deviceId)
            .maybeSingle();
          currentParticipant = pData;
          setParticipant(currentParticipant);
        }

        if (currentParticipant) {
          const { data: afiliadoData } = await supabase
            .from('espacio_afiliados')
            .select('id')
            .eq('participant_id', currentParticipant.id)
            .maybeSingle();
          setAfiliadoId(afiliadoData?.id || null);
        }

        const { data: projectData, error: projectError } = await supabase
          .from('espacio_proyectos')
          .select('*')
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;

        let ownerInfo = null;
        let ownerParticipantId = null;
        if (projectData.owner_id) {
          const { data: afiliadoData } = await supabase
            .from('espacio_afiliados')
            .select('participant_id')
            .eq('id', projectData.owner_id)
            .maybeSingle();

          if (afiliadoData?.participant_id) {
            ownerParticipantId = afiliadoData.participant_id;
            const { data: participantData } = await supabase
              .from('project_participants')
              .select('id, full_name, email, phone')
              .eq('id', afiliadoData.participant_id)
              .maybeSingle();

            if (participantData) {
              ownerInfo = {
                id: participantData.id,
                nombres_completos: participantData.full_name,
                email: participantData.email,
                celular: participantData.phone,
              };
            }
          }
        }

        setProject({ ...projectData, owner: ownerInfo });
        setEsPropietario(currentParticipant?.id === ownerParticipantId);

        await supabase
          .from('espacio_proyectos')
          .update({ views: (projectData.views || 0) + 1 })
          .eq('id', projectId);

        await cargarMensajes();

      } catch (err: any) {
        console.error('Error cargando proyecto:', err);
        setError(err.message || 'Error al cargar el proyecto');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [projectId]);

  // SUSCRIPCIÓN EN TIEMPO REAL CON LOGS EXTENDIDOS
  useEffect(() => {
    if (!projectId) return;

    console.log('🔌 Configurando suscripción para proyecto:', projectId);
    setRealtimeStatus('Conectando...');

    // Suscripción sin filtro para probar si llegan eventos de cualquier mensaje
    const channel = supabase
      .channel(`proyecto-mensajes-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'espacio_mensajes',
          // SIN FILTRO INICIALMENTE PARA DEPURAR
        },
        async (payload) => {
          console.log('📨 EVENTO REALTIME RECIBIDO (sin filtro):', payload);
          if (payload.new.proyecto_id === projectId) {
            console.log('✅ Este mensaje es para este proyecto. Recargando...');
            await cargarMensajes();
            setSuccessMsg('📨 Nuevo mensaje recibido');
            setTimeout(() => setSuccessMsg(null), 3000);
          } else {
            console.log('⏭️ Mensaje ignorado porque es de otro proyecto:', payload.new.proyecto_id);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔌 Estado suscripción:', status);
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('✅ Conectado');
          console.log('✅ Suscripción activa para proyecto:', projectId);
        } else if (status === 'CHANNEL_ERROR') {
          setRealtimeStatus('❌ Error de conexión');
          console.error('❌ Error en la suscripción. Realtime no está habilitado para la tabla espacio_mensajes.');
        } else {
          setRealtimeStatus(status);
        }
      });

    return () => {
      console.log('🔌 Limpiando suscripción');
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Enviar mensaje (unificado para emprendedor e inversionista)
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    let mensajeData: any = {
      proyecto_id: projectId,
      content: newMessage.trim(),
    };

    if (esPropietario && afiliadoId) {
      mensajeData.sender_afiliado_id = afiliadoId;
      mensajeData.sender_type = 'emprendedor';
    } else if (participant) {
      mensajeData.sender_participant_id = participant.id;
      mensajeData.sender_type = 'inversionista';
    } else {
      setErrorMsg('Debes iniciar sesión para enviar mensajes.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    setSendingMessage(true);
    try {
      const { error } = await supabase
        .from('espacio_mensajes')
        .insert(mensajeData);

      if (error) throw error;

      setNewMessage('');
      setSuccessMsg('✅ Mensaje enviado correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);
      // No recargamos manualmente porque el realtime lo hará
    } catch (err: any) {
      console.error('Error al enviar mensaje:', err);
      setErrorMsg(err.message || 'Error al enviar mensaje');
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4 mb-4">
            {error || 'Proyecto no encontrado'}
          </div>
          <button
            onClick={() => router.back()}
            className="text-green-700 hover:underline"
          >
            ← Volver
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{project.title}</h1>
          <button
            onClick={() => router.back()}
            className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800"
          >
            ← Volver
          </button>
        </div>

        {/* Indicador de estado de realtime */}
        <div className="mb-4 text-right text-xs">
          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${realtimeStatus.includes('Conectado') ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-slate-500">Realtime: {realtimeStatus}</span>
        </div>

        {successMsg && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl text-sm">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
            {errorMsg}
          </div>
        )}

        {/* Información del proyecto */}
        <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
              {project.category}
            </span>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
              {project.department} - {project.province} - {project.district}
            </span>
            <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              Inversión: S/ {project.investment_min?.toLocaleString()} - S/ {project.investment_max?.toLocaleString()}
            </span>
            <span className="text-xs font-semibold bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
              👁️ {project.views || 0} vistas
            </span>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Descripción del proyecto</h2>
            <p className="text-slate-800 whitespace-pre-wrap">{project.summary}</p>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Emprendedor</h2>
            <p className="text-slate-800 font-medium">
              {project.owner?.nombres_completos || 'No especificado'}
            </p>
            {project.owner?.email && (
              <p className="text-sm text-slate-500">📧 {project.owner.email}</p>
            )}
            {project.owner?.celular && (
              <p className="text-sm text-slate-500">📱 {project.owner.celular}</p>
            )}
          </div>

          {project.pdf_url && (
            <div className="mt-4">
              <a
                href={project.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-slate-200 text-slate-800 px-4 py-2 rounded-xl font-semibold hover:bg-slate-300 transition"
              >
                📄 Ver proyecto
              </a>
            </div>
          )}
        </div>

        {/* Sección de mensajes UNIFICADA */}
        <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">💬 Conversación</h2>
          <p className="text-sm text-slate-600 mb-4">
            {esPropietario 
              ? "Los inversionistas interesados en tu proyecto te enviarán mensajes aquí. Puedes responder desde esta misma caja."
              : "Envía un mensaje para consultar sobre el proyecto o expresar tu interés como inversionista."}
          </p>

          {/* Lista de mensajes */}
          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto bg-slate-50 rounded-xl p-4">
            {messages.length === 0 ? (
              <p className="text-slate-500 text-sm text-center">No hay mensajes aún. Sé el primero en escribir.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl ${
                    (msg.sender_type === 'inversionista' && !esPropietario) ||
                    (msg.sender_type === 'emprendedor' && esPropietario)
                      ? 'bg-green-100 ml-8'   // Mensaje propio (según rol)
                      : 'bg-slate-200 mr-8'    // Mensaje del otro
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-slate-700">
                      {msg.remitente_nombre}
                      {msg.sender_type === 'inversionista' && <span className="ml-1 text-green-600">💰</span>}
                      {msg.sender_type === 'emprendedor' && <span className="ml-1 text-blue-600">🚀</span>}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800">{msg.content}</p>
                </div>
              ))
            )}
          </div>

          {/* Caja de texto única para escribir */}
          {(participant || (esPropietario && afiliadoId)) ? (
            <div className="flex gap-3 items-start">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={esPropietario ? "Escribe tu respuesta como emprendedor..." : "Escribe tu mensaje para el emprendedor..."}
                rows={2}
                className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-3 focus:border-green-500 focus:outline-none resize-none text-sm"
              />
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage || !newMessage.trim()}
                className="bg-green-700 text-white px-5 py-3 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50 whitespace-nowrap text-sm"
              >
                {sendingMessage ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center">
              Para participar en la conversación, primero debes{' '}
              <Link href="/espacio-emprendedor" className="text-green-700 underline">
                iniciar sesión
              </Link>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}