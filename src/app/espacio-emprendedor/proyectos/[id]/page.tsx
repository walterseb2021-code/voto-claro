// src/app/espacio-emprendedor/proyectos/[id]/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
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
  sender: {
    full_name: string;
    email: string;
  } | null;
};

export default function EspacioEmprendedorProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [isInversionista, setIsInversionista] = useState(false);

  // Cargar datos
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1. Obtener participante actual
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
          
          // Verificar si es inversionista (tiene perfil configurado)
          if (currentParticipant) {
            const { data: investorData } = await supabase
              .from('espacio_inversionistas')
              .select('id')
              .eq('participant_id', currentParticipant.id)
              .maybeSingle();
            setIsInversionista(!!investorData);
          }
        }

        // 2. Obtener proyecto desde espacio_proyectos
        const { data: projectData, error: projectError } = await supabase
          .from('espacio_proyectos')
          .select(`
            id,
            title,
            category,
            summary,
            department,
            province,
            district,
            investment_min,
            investment_max,
            pdf_url,
            owner_id,
            status,
            views,
            created_at,
            owner:espacio_afiliados!owner_id (
              id,
              nombres_completos,
              email,
              celular
            )
          `)
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;

        // Transformar owner (viene como array)
        const transformedProject = {
          ...projectData,
          owner: projectData.owner && projectData.owner.length > 0 ? projectData.owner[0] : null,
        };
        setProject(transformedProject);

        // 3. Incrementar vistas
        await supabase
          .from('espacio_proyectos')
          .update({ views: (transformedProject.views || 0) + 1 })
          .eq('id', projectId);

        // 4. Cargar mensajes del chat (CORREGIDO)
        const { data: messagesData } = await supabase
          .from('espacio_mensajes')
          .select(`
            id,
            content,
            created_at,
            sender_type,
            sender_id,
            sender:project_participants!sender_id (
              full_name,
              email
            )
          `)
          .eq('proyecto_id', projectId)
          .order('created_at', { ascending: true });

        const transformedMessages = (messagesData || []).map((msg: any) => ({
          ...msg,
          sender: msg.sender && msg.sender.length > 0 ? msg.sender[0] : null,
        }));
        setMessages(transformedMessages);
        
      } catch (err: any) {
        console.error('Error cargando proyecto:', err);
        setError(err.message || 'Error al cargar el proyecto');
      } finally {
        setLoading(false);
      }
    }

    if (projectId) {
      loadData();
    }
  }, [projectId]);

  // Enviar mensaje
  const handleSendMessage = async () => {
    if (!participant) {
      alert('Debes iniciar sesión para contactar al emprendedor.');
      router.push('/espacio-emprendedor');
      return;
    }

    if (!newMessage.trim()) return;

    setSendingMessage(true);
    try {
      // Verificar si el participante tiene un registro en espacio_afiliados
      const { data: afiliadoData } = await supabase
        .from('espacio_afiliados')
        .select('id')
        .eq('participant_id', participant.id)
        .maybeSingle();

      if (!afiliadoData && !isInversionista) {
        alert('Para contactar al emprendedor, primero debes configurar tu perfil de inversionista.');
        router.push('/espacio-emprendedor/perfil-inversionista');
        return;
      }

      const senderId = afiliadoData?.id || participant.id;
      const senderType = isInversionista ? 'inversionista' : 'emprendedor';

      const { error } = await supabase
        .from('espacio_mensajes')
        .insert({
          proyecto_id: projectId,
          sender_id: senderId,
          sender_type: senderType,
          content: newMessage.trim(),
        });

      if (error) throw error;

      // Agregar mensaje localmente
      const newMessageObj: Message = {
        id: Date.now().toString(),
        content: newMessage.trim(),
        created_at: new Date().toISOString(),
        sender_type: senderType,
        sender: {
          full_name: participant.full_name || 'Usuario',
          email: participant.email || '',
        },
      };
      setMessages(prev => [...prev, newMessageObj]);
      setNewMessage('');
      
      alert('Mensaje enviado correctamente. El emprendedor recibirá una notificación.');
      
    } catch (err: any) {
      console.error('Error al enviar mensaje:', err);
      alert(err.message || 'Error al enviar mensaje');
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
        {/* Header con botón volver */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{project.title}</h1>
          <button
            onClick={() => router.back()}
            className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800"
          >
            ← Volver
          </button>
        </div>

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
            <p className="text-slate-800 font-medium">{project.owner?.nombres_completos || 'No especificado'}</p>
            {project.owner?.email && (
              <p className="text-sm text-slate-500">{project.owner.email}</p>
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
                📄 Ver hoja de vida / Plan de negocio
              </a>
            </div>
          )}
        </div>

        {/* Chat / Mensajería */}
        <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">💬 Contactar al emprendedor</h2>
          <p className="text-sm text-slate-600 mb-4">
            Envía un mensaje para consultar sobre el proyecto o expresar tu interés como inversionista.
          </p>

          {/* Lista de mensajes */}
          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto bg-slate-50 rounded-xl p-4">
            {messages.length === 0 ? (
              <p className="text-slate-500 text-sm text-center">No hay mensajes aún. Sé el primero en contactar al emprendedor.</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`p-3 rounded-xl ${msg.sender_type === 'inversionista' ? 'bg-green-100 ml-8' : 'bg-slate-200 mr-8'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-slate-700">
                      {msg.sender?.full_name || (msg.sender_type === 'inversionista' ? 'Inversionista' : 'Emprendedor')}
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

          {/* Formulario para nuevo mensaje */}
          {participant ? (
            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe tu mensaje para el emprendedor..."
                rows={3}
                className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none resize-none"
              />
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage || !newMessage.trim()}
                className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50 whitespace-nowrap"
              >
                {sendingMessage ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center">
              Para contactar al emprendedor, primero debes <Link href="/espacio-emprendedor" className="text-green-700 underline">iniciar sesión</Link>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}