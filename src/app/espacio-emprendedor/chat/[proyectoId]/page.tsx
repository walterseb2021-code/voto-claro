// src/app/espacio-emprendedor/chat/[proyectoId]/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Mensaje = {
  id: string;
  mensaje: string;
  emisor_id: string;
  receptor_id: string;
  created_at: string;
  leido: boolean;
  emisor: {
    alias: string;
  };
  receptor: {
    alias: string;
  };
};

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const proyectoId = params.proyectoId as string;

  const [participant, setParticipant] = useState<any>(null);
  const [proyecto, setProyecto] = useState<any>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [contactoId, setContactoId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [mensajes]);

  // Cargar datos del usuario y proyecto
  useEffect(() => {
    async function loadData() {
      const deviceId = localStorage.getItem('vc_device_id');
      if (!deviceId) {
        router.push('/proyecto-ciudadano/registro');
        return;
      }

      // Obtener participante
      const { data: participantData } = await supabase
        .from('project_participants')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (!participantData) {
        router.push('/proyecto-ciudadano/registro');
        return;
      }
      setParticipant(participantData);

      // Obtener proyecto con el owner (corregido)
      const { data: proyectoData } = await supabase
        .from('espacio_proyectos')
        .select(`
          id, 
          title, 
          owner_id,
          owner:espacio_afiliados!owner_id (
            participant_id
          )
        `)
        .eq('id', proyectoId)
        .single();

      if (proyectoData) {
        // owner viene como array, tomar el primero
        const ownerParticipantId = proyectoData.owner?.[0]?.participant_id;
        setProyecto({
          ...proyectoData,
          owner_participant_id: ownerParticipantId,
        });

        if (ownerParticipantId === participantData.id) {
          // Soy el dueño, necesito obtener el inversionista después
        } else {
          setContactoId(ownerParticipantId);
        }
      }

      setLoading(false);
    }

    loadData();
  }, [proyectoId, router]);

  // Cargar mensajes
  useEffect(() => {
    if (!participant || !proyecto) return;

    async function loadMensajes() {
      const { data, error } = await supabase
        .from('espacio_mensajes')
        .select(`
          id,
          mensaje,
          emisor_id,
          receptor_id,
          created_at,
          leido,
          emisor:project_participants!emisor_id (alias),
          receptor:project_participants!receptor_id (alias)
        `)
        .eq('proyecto_id', proyectoId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error cargando mensajes:', error);
        return;
      }

      const transformed = (data || []).map((msg: any) => ({
        ...msg,
        emisor: msg.emisor?.[0] || { alias: 'Anónimo' },
        receptor: msg.receptor?.[0] || { alias: 'Anónimo' },
      }));

      setMensajes(transformed);
    }

    loadMensajes();

    // Suscripción en tiempo real
    const subscription = supabase
      .channel(`chat-${proyectoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'espacio_mensajes',
          filter: `proyecto_id=eq.${proyectoId}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          setMensajes(prev => [...prev, {
            ...newMsg,
            emisor: { alias: newMsg.emisor_id === participant.id ? participant.alias : 'Otro' },
            receptor: { alias: '...' }
          }]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [participant, proyecto, proyectoId]);

  // Enviar mensaje
  const enviarMensaje = async () => {
    if (!nuevoMensaje.trim()) return;
    if (!participant) return;

    // Determinar el receptor
    let receptorId = contactoId;
    if (!receptorId && proyecto?.owner_participant_id === participant.id) {
      // Soy el dueño, necesito el inversionista. Por ahora mostramos alerta
      alert('Espera a que un inversionista te contacte primero.');
      return;
    }
    if (!receptorId) {
      receptorId = proyecto?.owner_participant_id;
    }

    if (!receptorId) {
      alert('No se pudo determinar el destinatario.');
      return;
    }

    setEnviando(true);
    try {
      const { error } = await supabase
        .from('espacio_mensajes')
        .insert({
          proyecto_id: proyectoId,
          emisor_id: participant.id,
          receptor_id: receptorId,
          mensaje: nuevoMensaje.trim(),
        });

      if (error) throw error;

      setNuevoMensaje('');
    } catch (err) {
      console.error('Error enviando mensaje:', err);
      alert('Error al enviar mensaje');
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
            <p className="text-sm text-slate-600">
              Proyecto: {proyecto?.title || 'Cargando...'}
            </p>
          </div>
          <Link href="/espacio-emprendedor/explorar" className="text-sm text-slate-600 hover:underline">
            ← Volver a proyectos
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 shadow-sm overflow-hidden">
          {/* Área de mensajes */}
          <div className="h-96 overflow-y-auto p-4 space-y-3">
            {mensajes.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                No hay mensajes aún. Envía el primero.
              </div>
            ) : (
              mensajes.map((msg) => {
                const esMio = msg.emisor_id === participant?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${esMio ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        esMio
                          ? 'bg-green-600 text-white rounded-br-none'
                          : 'bg-slate-100 text-slate-800 rounded-bl-none'
                      }`}
                    >
                      <p className="text-xs font-semibold mb-1">
                        {esMio ? 'Tú' : msg.emisor?.alias || 'Inversionista'}
                      </p>
                      <p className="text-sm">{msg.mensaje}</p>
                      <p className="text-xs opacity-70 mt-1 text-right">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input de mensaje */}
          <div className="border-t border-slate-200 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={nuevoMensaje}
                onChange={(e) => setNuevoMensaje(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && enviarMensaje()}
                placeholder="Escribe tu mensaje..."
                className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                disabled={enviando}
              />
              <button
                onClick={enviarMensaje}
                disabled={enviando || !nuevoMensaje.trim()}
                className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}