// src/app/espacio-emprendedor/proyectos/[id]/page.tsx
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
  const [respondiendoA, setRespondiendoA] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);
  const [esPropietario, setEsPropietario] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Referencia para el canal
  const channelRef = useRef<any>(null);

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

    console.log('📦 Mensajes en BD:', messagesData?.length);

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
    console.log('✅ Mensajes cargados en estado:', mensajesConNombres.length);
  }

  // Configurar suscripción en tiempo real
  function setupRealtimeSubscription() {
    if (channelRef.current) {
      console.log('🔌 Eliminando suscripción anterior');
      supabase.removeChannel(channelRef.current);
    }

    console.log('🔌 Creando nueva suscripción para proyecto:', projectId);
    const channel = supabase
      .channel(`proyecto-mensajes-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'espacio_mensajes',
          filter: `proyecto_id=eq.${projectId}`,
        },
        async (payload) => {
          console.log('📨 NUEVO MENSAJE RECIBIDO EN TIEMPO REAL:', payload.new);
          // Recargar mensajes inmediatamente
          await cargarMensajes();
          setSuccessMsg('📨 Nuevo mensaje recibido');
          setTimeout(() => setSuccessMsg(null), 3000);
        }
      )
      .subscribe((status) => {
        console.log('🔌 Estado de suscripción:', status);
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;
  }

  // Cargar datos iniciales
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1. Obtener participante actual
        const deviceId = localStorage.getItem('vc_device_id');
        console.log('🔍 Device ID:', deviceId);
        let currentParticipant = null;
        if (deviceId) {
          const { data: pData } = await supabase
            .from('project_participants')
            .select('*')
            .eq('device_id', deviceId)
            .maybeSingle();
          currentParticipant = pData;
          setParticipant(currentParticipant);
          console.log('👤 Participante actual:', currentParticipant?.full_name);
        }

        // 2. Obtener afiliado_id si es emprendedor
        if (currentParticipant) {
          const { data: afiliadoData } = await supabase
            .from('espacio_afiliados')
            .select('id')
            .eq('participant_id', currentParticipant.id)
            .maybeSingle();
          setAfiliadoId(afiliadoData?.id || null);
          console.log('🏷️ Afiliado ID:', afiliadoData?.id);
        }

        // 3. Obtener proyecto desde espacio_proyectos
        const { data: projectData, error: projectError } = await supabase
          .from('espacio_proyectos')
          .select('*')
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;

        // 4. Obtener el dueño del proyecto
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

        // Determinar si el usuario actual es el dueño
        const esProp = currentParticipant?.id === ownerParticipantId;
        setEsPropietario(esProp);
        console.log('🏷️ Es propietario:', esProp);

        // 5. Incrementar vistas
        await supabase
          .from('espacio_proyectos')
          .update({ views: (projectData.views || 0) + 1 })
          .eq('id', projectId);

        // 6. Cargar mensajes
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

  // Configurar suscripción después de cargar los datos
  useEffect(() => {
    if (!projectId) return;

    setupRealtimeSubscription();

    return () => {
      if (channelRef.current) {
        console.log('🔌 Limpiando suscripción al desmontar');
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [projectId]);

  // Enviar mensaje (inversionista)
  const handleSendMessage = async () => {
    if (!participant) {
      setErrorMsg('Debes iniciar sesión para contactar al emprendedor.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    if (!newMessage.trim()) return;

    const mensajeData = {
      proyecto_id: projectId,
      sender_participant_id: participant.id,
      sender_type: 'inversionista',
      content: newMessage.trim(),
    };
    console.log('📤 Enviando mensaje:', mensajeData);

    setSendingMessage(true);
    try {
      const { error } = await supabase
        .from('espacio_mensajes')
        .insert(mensajeData);

      if (error) throw error;

      setNewMessage('');
      setSuccessMsg('✅ Mensaje enviado correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);
      
      await cargarMensajes();
      
    } catch (err: any) {
      console.error('Error al enviar mensaje:', err);
      setErrorMsg(err.message || 'Error al enviar mensaje');
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setSendingMessage(false);
    }
  };

  // Responder mensaje (emprendedor)
  const handleResponder = async (mensajeId: string) => {
    if (!respuesta.trim()) return;

    const respuestaData = {
      proyecto_id: projectId,
      sender_afiliado_id: afiliadoId,
      sender_type: 'emprendedor',
      content: respuesta.trim(),
    };
    console.log('📤 Enviando respuesta:', respuestaData);

    setEnviandoRespuesta(true);
    try {
      const { error } = await supabase
        .from('espacio_mensajes')
        .insert(respuestaData);

      if (error) throw error;

      setRespuesta('');
      setRespondiendoA(null);
      setSuccessMsg('✅ Respuesta enviada correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);
      
      await cargarMensajes();
      
    } catch (err: any) {
      console.error('Error al enviar respuesta:', err);
      setErrorMsg(err.message || 'Error al enviar respuesta');
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setEnviandoRespuesta(false);
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

        {/* Sección de mensajes */}
        <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm">
          {esPropietario ? (
            // Vista para EMPRENDEDOR
            <>
              <h2 className="text-xl font-bold text-slate-900 mb-4">💬 Mensajes recibidos</h2>
              <p className="text-sm text-slate-600 mb-4">
                Los inversionistas interesados en tu proyecto te enviarán mensajes aquí.
              </p>

              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto bg-slate-50 rounded-xl p-4">
                {messages.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center">No hay mensajes aún.</p>
                ) : (
                  messages.filter(msg => msg.sender_type === 'inversionista').map((msg) => (
                    <div key={msg.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-sm font-semibold text-slate-800">
                            {msg.remitente_nombre}
                          </span>
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Inversionista</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{msg.content}</p>
                      
                      {respondiendoA === msg.id ? (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <textarea
                            value={respuesta}
                            onChange={(e) => setRespuesta(e.target.value)}
                            placeholder="Escribe tu respuesta..."
                            rows={2}
                            className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none resize-none text-sm mb-2"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResponder(msg.id)}
                              disabled={enviandoRespuesta || !respuesta.trim()}
                              className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 disabled:opacity-50"
                            >
                              {enviandoRespuesta ? 'Enviando...' : 'Enviar respuesta'}
                            </button>
                            <button
                              onClick={() => {
                                setRespondiendoA(null);
                                setRespuesta('');
                              }}
                              className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRespondiendoA(msg.id)}
                          className="mt-3 text-xs text-green-700 hover:underline"
                        >
                          Responder →
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            // Vista para INVERSIONISTA
            <>
              <h2 className="text-xl font-bold text-slate-900 mb-4">💬 Contactar al emprendedor</h2>
              <p className="text-sm text-slate-600 mb-4">
                Envía un mensaje para consultar sobre el proyecto o expresar tu interés como inversionista.
              </p>

              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto bg-slate-50 rounded-xl p-4">
                {messages.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center">No hay mensajes aún. Sé el primero en contactar al emprendedor.</p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`p-3 rounded-xl ${msg.sender_type === 'inversionista' ? 'bg-green-100 ml-8' : 'bg-slate-200 mr-8'}`}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-slate-700">
                          {msg.remitente_nombre}
                          {msg.sender_type === 'inversionista' && <span className="ml-1 text-green-600">💰</span>}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{msg.content}</p>
                    </div>
                  ))
                )}
              </div>

              {participant ? (
                <div className="flex gap-3 items-start">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Escribe tu mensaje para el emprendedor..."
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
                  Para contactar al emprendedor, primero debes <Link href="/espacio-emprendedor" className="text-green-700 underline">iniciar sesión</Link>.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}