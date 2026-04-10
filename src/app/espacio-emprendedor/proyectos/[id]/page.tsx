'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

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
  destinatario_participant_id?: string | null;
  destinatario_afiliado_id?: string | null;
  thread_key?: string | null;
  remitente_nombre: string;
};

type ThreadSummary = {
  investorId: string;
  investorName: string;
  lastMessage: string;
  lastAt: string;
  threadKey: string;
};

function buildThreadKey(projectId: string, investorId: string) {
  return `${projectId}::${investorId}`;
}

export default function EspacioEmprendedorProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const destinatarioParam = String(searchParams.get('destinatario') || '').trim();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [afiliadoId, setAfiliadoId] = useState<string | null>(null);
  const [ownerParticipantId, setOwnerParticipantId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState<string>('');
  const [selectedInvestorName, setSelectedInvestorName] = useState<string>('');
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [esPropietario, setEsPropietario] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('Conectando...');

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-PE', { timeZone: 'America/Lima' });
  };

  const canUseConversation = useMemo(() => {
    if (!participant) return false;
    if (esPropietario) return true;
    return !!participant?.id;
  }, [participant, esPropietario]);

  async function cargarNombresParticipantes(ids: string[]) {
    const validIds = Array.from(new Set(ids.filter(Boolean)));
    if (!validIds.length) return new Map<string, string>();

    const { data } = await supabase
      .from('project_participants')
      .select('id, full_name')
      .in('id', validIds);

    const map = new Map<string, string>();
    (data || []).forEach((p: any) => {
      map.set(p.id, p.full_name || 'Inversionista');
    });
    return map;
  }

  async function obtenerNombreRemitente(
    senderType: string,
    afiliadoIdParam: string | null,
    participanteId: string | null,
    ownerName?: string
  ): Promise<string> {
    if (senderType === 'emprendedor') {
      return ownerName || 'Emprendedor';
    }

    if (senderType === 'inversionista' && participanteId) {
      const { data: participante } = await supabase
        .from('project_participants')
        .select('full_name')
        .eq('id', participanteId)
        .maybeSingle();

      return participante?.full_name || 'Inversionista';
    }

    if (senderType === 'emprendedor' && afiliadoIdParam) {
      return ownerName || 'Emprendedor';
    }

    return 'Usuario';
  }

  async function cargarResumenHilos(
    currentProject: Project,
    currentParticipant: any,
    isOwner: boolean
  ) {
    const { data, error } = await supabase
      .from('espacio_mensajes')
      .select('*')
      .eq('proyecto_id', projectId)
      .neq('thread_key', 'legacy-no-thread')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando hilos:', error);
      setThreads([]);
      return;
    }

    const investorIds = Array.from(
      new Set(
        (data || [])
          .map((msg: any) =>
            msg.sender_type === 'inversionista'
              ? msg.sender_participant_id
              : msg.destinatario_participant_id
          )
          .filter(Boolean)
      )
    ) as string[];

    const nameMap = await cargarNombresParticipantes(investorIds);
    const latestByInvestor = new Map<string, ThreadSummary>();

    (data || []).forEach((msg: any) => {
      const investorId =
        msg.sender_type === 'inversionista'
          ? msg.sender_participant_id
          : msg.destinatario_participant_id;

      if (!investorId) return;
      if (latestByInvestor.has(investorId)) return;

      latestByInvestor.set(investorId, {
        investorId,
        investorName:
          nameMap.get(investorId) ||
          (currentParticipant?.id === investorId ? currentParticipant?.full_name : '') ||
          'Inversionista',
        lastMessage: msg.content,
        lastAt: msg.created_at,
        threadKey: buildThreadKey(projectId, investorId),
      });
    });

    const threadList = Array.from(latestByInvestor.values()).sort((a, b) =>
      b.lastAt.localeCompare(a.lastAt)
    );

    setThreads(threadList);

    if (isOwner) {
      if (destinatarioParam) {
        const selected =
          threadList.find((t) => t.investorId === destinatarioParam) ||
          ({
            investorId: destinatarioParam,
            investorName: 'Inversionista',
            lastMessage: '',
            lastAt: '',
            threadKey: buildThreadKey(projectId, destinatarioParam),
          } as ThreadSummary);

        setSelectedInvestorId(selected.investorId);
        setSelectedInvestorName(selected.investorName);
        await cargarMensajesThread(currentProject, selected.investorId, true, currentParticipant);
      } else {
        setSelectedInvestorId('');
        setSelectedInvestorName('');
        setMessages([]);
      }
    } else if (currentParticipant?.id) {
      setSelectedInvestorId(currentParticipant.id);
      setSelectedInvestorName(currentParticipant.full_name || 'Inversionista');
      await cargarMensajesThread(currentProject, currentParticipant.id, false, currentParticipant);
    }
  }

  async function cargarMensajesThread(
    currentProject: Project,
    investorId: string,
    isOwner: boolean,
    currentParticipant: any
  ) {
    if (!investorId) {
      setMessages([]);
      return;
    }

    if (!isOwner && currentParticipant?.id !== investorId) {
      setMessages([]);
      return;
    }

    const threadKey = buildThreadKey(projectId, investorId);

    const { data, error } = await supabase
      .from('espacio_mensajes')
      .select('*')
      .eq('thread_key', threadKey)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error cargando mensajes del hilo:', error);
      setMessages([]);
      return;
    }

    const mensajesConNombres = await Promise.all(
      (data || []).map(async (msg: any) => {
        const nombre = await obtenerNombreRemitente(
          msg.sender_type,
          msg.sender_afiliado_id,
          msg.sender_participant_id,
          currentProject.owner?.nombres_completos || 'Emprendedor'
        );

        return {
          ...msg,
          remitente_nombre: nombre,
        };
      })
    );

    setMessages(mensajesConNombres);
  }

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
        } else {
          setAfiliadoId(null);
        }

        const { data: projectData, error: projectError } = await supabase
          .from('espacio_proyectos')
          .select('*')
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;

        let ownerInfo = null;
        let ownerParticipantIdLocal: string | null = null;

        if (projectData.owner_id) {
          const { data: afiliadoData } = await supabase
            .from('espacio_afiliados')
            .select('participant_id')
            .eq('id', projectData.owner_id)
            .maybeSingle();

          if (afiliadoData?.participant_id) {
            ownerParticipantIdLocal = afiliadoData.participant_id;

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

        const enrichedProject = { ...projectData, owner: ownerInfo };
        const isOwner = currentParticipant?.id === ownerParticipantIdLocal;

        setProject(enrichedProject);
        setOwnerParticipantId(ownerParticipantIdLocal);
        setEsPropietario(isOwner);

        await supabase
          .from('espacio_proyectos')
          .update({ views: (projectData.views || 0) + 1 })
          .eq('id', projectId);

        await cargarResumenHilos(enrichedProject, currentParticipant, isOwner);
      } catch (err: any) {
        console.error('Error cargando proyecto:', err);
        setError(err.message || 'Error al cargar el proyecto');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [projectId, destinatarioParam]);

  useEffect(() => {
    if (!projectId || !project) return;

    setRealtimeStatus('Conectando...');

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
        async () => {
          if (!project) return;
          await cargarResumenHilos(project, participant, esPropietario);
          setSuccessMsg('📨 Nuevo mensaje recibido');
          setTimeout(() => setSuccessMsg(null), 3000);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('✅ Conectado');
        } else if (status === 'CHANNEL_ERROR') {
          setRealtimeStatus('❌ Error de conexión');
        } else {
          setRealtimeStatus(status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, project, participant, esPropietario, destinatarioParam]);

  useEffect(() => {
    if (loading) return;

            if (error || !project) {
      setPageContext({
        pageId: "espacio-emprendedor-proyecto-detalle",
        pageTitle: "Espacio Emprendedor",
        route: `/espacio-emprendedor/proyectos/${projectId}`,
        summary: "No se pudo cargar el detalle del proyecto emprendedor.",
        speakableSummary: "No se pudo cargar el detalle del proyecto emprendedor.",
        activeSection: "proyecto-detalle-error",
        activeViewId: "error",
        activeViewTitle: "Detalle del proyecto no disponible",
        breadcrumb: ["Espacio Emprendedor", "Detalle del proyecto"],
        visibleText:
          `Vista activa: detalle del proyecto no disponible.\n` +
          `Estado: error.\n` +
          `${error || "Proyecto no encontrado"}`,
        availableActions: ["Volver"],
        selectedItemTitle: undefined,
        status: "error",
        dynamicData: {
          projectId,
          detailLoaded: false,
          viewMode: "error",
          userRole: "desconocido",
          privacyMode: "private-threads",
        },
      });
      return;
    }
         const latestMessage = messages.length ? messages[messages.length - 1] : null;
    const latestThread = threads.length ? threads[0] : null;

    const canSendMessage = Boolean(
      project &&
        ((esPropietario && afiliadoId && selectedInvestorId) ||
          (!esPropietario && participant?.id))
    );

    const viewMode =
      !participant
        ? "public-only"
        : esPropietario && !selectedInvestorId
        ? "thread-list"
        : "thread-detail";

    const activeViewId =
      viewMode === "public-only"
        ? "public-detail"
        : viewMode === "thread-list"
        ? "thread-list"
        : "thread-detail";

    const activeViewTitle =
      viewMode === "public-only"
        ? "Detalle público del proyecto"
        : viewMode === "thread-list"
        ? "Lista de hilos privados"
        : "Hilo privado abierto";

    const userRole = !participant
      ? "visitante"
      : esPropietario
      ? "emprendedor"
      : "inversionista";

    const activeSection =
      viewMode === "public-only"
        ? "proyecto-detalle-publico"
        : viewMode === "thread-list"
        ? "proyecto-hilos-emprendedor"
        : "proyecto-hilo-privado";

    const visibleParts: string[] = [];
    visibleParts.push(`Vista activa: ${activeViewTitle}.`);
    visibleParts.push(`Proyecto visible: ${project.title}.`);
    visibleParts.push(`Emprendedor visible: ${project.owner?.nombres_completos || "No especificado"}.`);
    visibleParts.push(`Rol actual del usuario: ${userRole}.`);
    visibleParts.push(`Hilos privados detectados para este proyecto: ${threads.length}.`);
    visibleParts.push(`Mensajes visibles en el hilo actual: ${messages.length}.`);

    if (selectedInvestorName) {
      visibleParts.push(`Inversionista visible del hilo actual: ${selectedInvestorName}.`);
    }

    if (latestThread && viewMode === "thread-list") {
      visibleParts.push(`Hilo más reciente detectado: ${latestThread.investorName}.`);
      if (latestThread.lastAt) {
        visibleParts.push(`Fecha y hora del último hilo detectado: ${formatDate(latestThread.lastAt)}.`);
      }
      if (latestThread.lastMessage) {
        visibleParts.push(`Último mensaje resumido del hilo más reciente: ${latestThread.lastMessage}.`);
      }
    }

    if (latestMessage) {
      visibleParts.push(`Último mensaje visible de ${latestMessage.remitente_nombre}: ${latestMessage.content}`);
      visibleParts.push(`Fecha y hora visibles del último mensaje: ${formatDate(latestMessage.created_at)}.`);
    }

    if (!participant) {
      visibleParts.push("La conversación privada está oculta para visitantes.");
    } else if (esPropietario && !selectedInvestorId) {
      visibleParts.push("El emprendedor está viendo la lista de hilos privados disponibles.");
    } else if (esPropietario) {
      visibleParts.push("El emprendedor está viendo un hilo privado abierto con un inversionista específico.");
    } else {
      visibleParts.push("El inversionista solo está viendo su propio hilo privado.");
    }

    const availableActions = [
      project.pdf_url ? "Ver proyecto" : null,
      canSendMessage ? "Enviar mensaje" : null,
      esPropietario && selectedInvestorId ? "Volver a hilos" : null,
      "Volver",
    ].filter(Boolean) as string[];

    const summary =
      viewMode === "public-only"
        ? "Detalle público del proyecto. La conversación privada está protegida."
        : viewMode === "thread-list"
        ? "Detalle del proyecto con lista de hilos privados por inversionista."
        : esPropietario
        ? "Detalle del proyecto con hilo privado abierto para un inversionista específico."
        : "Detalle del proyecto con hilo privado del inversionista actual.";

            setPageContext({
      pageId: "espacio-emprendedor-proyecto-detalle",
      pageTitle: "Espacio Emprendedor",
      route: `/espacio-emprendedor/proyectos/${projectId}`,
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ["Espacio Emprendedor", "Detalle del proyecto", project.title, activeViewTitle],
      suggestedPrompts:
        viewMode === "public-only"
          ? [
              {
                id: "ee-detail-1",
                label: "¿Qué estoy viendo aquí?",
                question: "¿Qué estoy viendo aquí en esta pantalla?",
              },
              {
                id: "ee-detail-2",
                label: "¿Este proyecto tiene mensajes privados?",
                question: "¿Este proyecto tiene mensajes privados visibles en esta pantalla?",
              },
              {
                id: "ee-detail-3",
                label: "¿Puedo ver conversaciones privadas?",
                question: "¿Puedo ver conversaciones privadas desde esta pantalla?",
              },
            ]
          : viewMode === "thread-list"
          ? [
              {
                id: "ee-detail-4",
                label: "¿Estoy en una lista o en un hilo?",
                question: "¿Estoy viendo una lista de hilos o un hilo abierto en esta pantalla?",
              },
              {
                id: "ee-detail-5",
                label: "¿Cuántos hilos hay?",
                question: "¿Cuántos hilos privados hay visibles en esta pantalla?",
              },
              {
                id: "ee-detail-6",
                label: "¿Cuál fue el último hilo?",
                question: "¿Cuál es el hilo más reciente visible en esta pantalla?",
              },
            ]
          : [
              {
                id: "ee-detail-7",
                label: "¿Con quién estoy hablando?",
                question: "¿Con quién estoy hablando en este hilo privado?",
              },
              {
                id: "ee-detail-8",
                label: "¿Cuándo fue el último mensaje?",
                question: "¿Cuándo fue el último mensaje visible en este hilo?",
              },
              {
                id: "ee-detail-9",
                label: "¿Este hilo es privado?",
                question: "¿Este hilo es privado según esta pantalla?",
              },
            ],
      visibleText: visibleParts.join("\n"),
      availableActions,
      selectedItemTitle: project.title,
      status: "ready",
      dynamicData: {
        userRole,
        viewMode,
        privacyMode: "private-threads",
        participantLogueado: !!participant,
        afiliadoVerificado: !!afiliadoId,
        esPropietario,
        projectId: project.id,
        projectTitle: project.title,
        ownerName: project.owner?.nombres_completos || "",
        threadCount: threads.length,
        threadListVisible: viewMode === "thread-list",
        threadDetailVisible: viewMode === "thread-detail",
        selectedThreadKey: selectedInvestorId ? buildThreadKey(projectId, selectedInvestorId) : "",
        selectedInvestorId: selectedInvestorId || "",
        selectedInvestorName: selectedInvestorName || "",
        latestThreadInvestorName: latestThread?.investorName || "",
        latestThreadAtIso: latestThread?.lastAt || "",
        latestThreadAtLabel: latestThread?.lastAt ? formatDate(latestThread.lastAt) : "",
        latestThreadLastMessage: latestThread?.lastMessage || "",
        mensajesCount: messages.length,
        latestMessageAuthor: latestMessage?.remitente_nombre || "",
        latestMessageContent: latestMessage?.content || "",
        latestMessageCreatedAtIso: latestMessage?.created_at || "",
        latestMessageCreatedAtLabel: latestMessage ? formatDate(latestMessage.created_at) : "",
        canSendMessage,
        conversationVisible: !!participant && (!esPropietario || !!selectedInvestorId),
        conversationPrivateByThread: true,
        realtimeStatus,
        threadSummaries: threads.slice(0, 5).map((thread) => ({
          investorId: thread.investorId,
          investorName: thread.investorName,
          lastAtIso: thread.lastAt,
          lastAtLabel: thread.lastAt ? formatDate(thread.lastAt) : "",
          lastMessage: thread.lastMessage,
          threadKey: thread.threadKey,
        })),
      },
    });

    return () => {
      clearPageContext();
    };
  }, [
    setPageContext,
    clearPageContext,
    loading,
    error,
    project,
    projectId,
    participant,
    afiliadoId,
    esPropietario,
    threads,
    selectedInvestorId,
    selectedInvestorName,
    messages,
    realtimeStatus,
  ]);

  const openThreadAsOwner = async (investorId: string, investorName: string) => {
    setSelectedInvestorId(investorId);
    setSelectedInvestorName(investorName);
    router.push(`/espacio-emprendedor/proyectos/${projectId}?destinatario=${investorId}`);
  };

  const handleSendMessage = async () => {
    if (!project || !newMessage.trim()) return;

    let mensajeData: any = {
      proyecto_id: projectId,
      content: newMessage.trim(),
    };

    if (esPropietario) {
      if (!afiliadoId || !selectedInvestorId) {
        setErrorMsg('Primero debes elegir el hilo del inversionista.');
        setTimeout(() => setErrorMsg(null), 3000);
        return;
      }

      mensajeData.thread_key = buildThreadKey(projectId, selectedInvestorId);
      mensajeData.sender_afiliado_id = afiliadoId;
      mensajeData.sender_type = 'emprendedor';
      mensajeData.destinatario_participant_id = selectedInvestorId;
    } else if (participant) {
      mensajeData.thread_key = buildThreadKey(projectId, participant.id);
      mensajeData.sender_participant_id = participant.id;
      mensajeData.sender_type = 'inversionista';
      mensajeData.destinatario_afiliado_id = project.owner_id;
    } else {
      setErrorMsg('Debes iniciar sesión para enviar mensajes.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    setSendingMessage(true);

    try {
      const { error } = await supabase.from('espacio_mensajes').insert(mensajeData);
      if (error) throw error;

      setNewMessage('');
      setSuccessMsg('✅ Mensaje enviado correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);

      if (project) {
        await cargarResumenHilos(project, participant, esPropietario);
      }
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
          <button onClick={() => router.back()} className="text-green-700 hover:underline">
            ← Volver
          </button>
        </div>
      </main>
    );
  }

  const latestThreadAt = threads.length ? threads[0].lastAt : '';

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

        <div className="mb-4 text-right text-xs">
          <span
            className={`inline-block w-2 h-2 rounded-full mr-1 ${
              realtimeStatus.includes('Conectado') ? 'bg-green-500' : 'bg-red-500'
            }`}
          ></span>
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
            <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
              💬 {threads.length} hilo(s)
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
            {project.owner?.email && <p className="text-sm text-slate-500">📧 {project.owner.email}</p>}
            {project.owner?.celular && <p className="text-sm text-slate-500">📱 {project.owner.celular}</p>}
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

        <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">💬 Conversación privada</h2>

          {!participant ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              La conversación privada solo se habilita para el emprendedor del proyecto o para el inversionista que participa en su propio hilo.
            </div>
          ) : esPropietario && !selectedInvestorId ? (
            <>
              <p className="text-sm text-slate-600 mb-4">
                Aquí no se mezclan conversaciones. Cada inversionista tiene su propio hilo privado.
              </p>

              {threads.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Aún no hay hilos privados abiertos para este proyecto.
                </div>
              ) : (
                <div className="space-y-3">
                  {threads.map((thread) => (
                    <button
                      key={thread.threadKey}
                      onClick={() => openThreadAsOwner(thread.investorId, thread.investorName)}
                      className="w-full text-left rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{thread.investorName}</p>
                          <p className="text-sm text-slate-600 mt-1">{thread.lastMessage || 'Sin mensaje visible'}</p>
                        </div>
                        <div className="text-xs text-slate-500 whitespace-nowrap">
                          {thread.lastAt ? formatDate(thread.lastAt) : 'Sin fecha'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {latestThreadAt && (
                <p className="text-xs text-slate-500 mt-4">
                  Último movimiento visible: {formatDate(latestThreadAt)}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-sm text-slate-600">
                  {esPropietario
                    ? `Hilo privado con ${selectedInvestorName || 'inversionista'}`
                    : 'Tu hilo privado con el emprendedor'}
                </p>

                {esPropietario ? (
                  <button
                    onClick={() => router.push(`/espacio-emprendedor/proyectos/${projectId}`)}
                    className="text-sm text-green-700 hover:underline"
                  >
                    ← Volver a hilos
                  </button>
                ) : null}
              </div>

              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto bg-slate-50 rounded-xl p-4">
                {messages.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center">
                    No hay mensajes en este hilo todavía.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-xl ${
                        (msg.sender_type === 'inversionista' && !esPropietario) ||
                        (msg.sender_type === 'emprendedor' && esPropietario)
                          ? 'bg-green-100 ml-8'
                          : 'bg-slate-200 mr-8'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-slate-700">
                          {msg.remitente_nombre}
                          {msg.sender_type === 'inversionista' && <span className="ml-1 text-green-600">💰</span>}
                          {msg.sender_type === 'emprendedor' && <span className="ml-1 text-blue-600">🚀</span>}
                        </span>
                        <span className="text-xs text-slate-400">{formatDate(msg.created_at)}</span>
                      </div>
                      <p className="text-sm text-slate-800">{msg.content}</p>
                    </div>
                  ))
                )}
              </div>

              {canUseConversation ? (
                 <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
  <textarea
    value={newMessage}
    onChange={(e) => setNewMessage(e.target.value)}
    placeholder={
      esPropietario
        ? 'Escribe tu respuesta al inversionista...'
        : 'Escribe tu mensaje para el emprendedor...'
    }
    rows={3}
    className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 focus:border-green-500 focus:outline-none resize-none text-sm"
  />
  <button
    type="button"
    onClick={handleSendMessage}
    disabled={sendingMessage || !newMessage.trim()}
    className="w-full sm:w-[150px] rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 disabled:opacity-50 text-sm leading-tight px-3 py-3"
  >
    {sendingMessage ? (
      <>
        <span className="block">Enviando</span>
        <span className="block">...</span>
      </>
    ) : (
      <>
        <span className="block">Enviar</span>
        <span className="block">mensaje</span>
      </>
    )}
  </button>
</div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}