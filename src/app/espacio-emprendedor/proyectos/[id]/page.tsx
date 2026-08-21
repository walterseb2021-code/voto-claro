'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useParams,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

type Participant = {
  id: string;
  alias: string | null;
  display_name: string | null;
};

type Project = {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  investment_min: number | null;
  investment_max: number | null;
  pdf_url: string | null;
  status: string;
  views: number;
  created_at: string | null;
  owner: {
    alias: string;
  };
};

type Message = {
  id: string;
  content: string;
  created_at: string | null;
  sender_type: 'emprendedor' | 'inversionista';
  leido: boolean;
};

type ThreadSummary = {
  id: string;
  investorId: string;
  investorName: string;
  lastMessage: string;
  lastAt: string | null;
  senderType: 'emprendedor' | 'inversionista';
  unreadCount: number;
};

type Viewer = {
  authenticated: boolean;
  participant: Participant | null;
  affiliate_status: string;
  is_owner: boolean;
  can_message: boolean;
};

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Sin fecha';

  return date.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
  });
}

function participantLabel(participant: Participant | null) {
  return (
    participant?.display_name?.trim() ||
    participant?.alias?.trim() ||
    'Inversionista'
  );
}

function investmentLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'No indicado';
  }

  return `S/ ${value.toLocaleString('es-PE')}`;
}

export default function EspacioEmprendedorProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const projectId = String(params.id ?? '').trim();
  const destinatarioParam = String(
    searchParams.get('destinatario') ?? ''
  ).trim();

  const [project, setProject] = useState<Project | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [affiliateStatus, setAffiliateStatus] = useState('missing');
  const [esPropietario, setEsPropietario] = useState(false);
  const [canMessage, setCanMessage] = useState(false);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState('');
  const [selectedInvestorName, setSelectedInvestorName] = useState('');
  const [currentThreadKey, setCurrentThreadKey] = useState('');

  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('Actualizando...');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const autoGuideSeenRef = useRef<Set<string>>(new Set());

  const canUseConversation = useMemo(() => {
    if (!participant) return false;

    if (esPropietario) {
      return Boolean(selectedInvestorId);
    }

    return canMessage;
  }, [participant, esPropietario, selectedInvestorId, canMessage]);

  const mapThreads = (value: unknown): ThreadSummary[] => {
    if (!Array.isArray(value)) return [];

    return value.flatMap((thread: any) => {
      const investorId = String(thread?.investor_id ?? '').trim();
      const id = String(thread?.id ?? '').trim();

      if (!investorId || !id) return [];

      const senderType =
        thread?.sender_type === 'emprendedor'
          ? 'emprendedor'
          : 'inversionista';

      return [
        {
          id,
          investorId,
          investorName:
            String(thread?.investor_alias ?? '').trim() ||
            'Inversionista',
          lastMessage: String(thread?.content ?? '').trim(),
          lastAt:
            typeof thread?.created_at === 'string'
              ? thread.created_at
              : null,
          senderType,
          unreadCount: Math.max(
            0,
            Math.trunc(Number(thread?.unread_count ?? 0) || 0)
          ),
        },
      ];
    });
  };

  const mapMessages = (value: unknown): Message[] => {
    if (!Array.isArray(value)) return [];

    return value.flatMap((message: any) => {
      const id = String(message?.id ?? '').trim();
      const content = String(message?.content ?? '').trim();

      const senderType =
        message?.sender_type === 'emprendedor'
          ? 'emprendedor'
          : message?.sender_type === 'inversionista'
          ? 'inversionista'
          : null;

      if (!id || !content || !senderType) return [];

      return [
        {
          id,
          content,
          sender_type: senderType,
          leido: message?.leido === true,
          created_at:
            typeof message?.created_at === 'string'
              ? message.created_at
              : null,
        },
      ];
    });
  };

  async function cargarPantalla(silent = false) {
    if (!projectId) return;

    if (!silent) {
      setLoading(true);
    }

    setSyncStatus('Actualizando...');

    try {
      const detailResponse = await fetch(
        `/api/espacio-emprendedor/proyectos/${encodeURIComponent(projectId)}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }
      );

      const detailData = await detailResponse.json().catch(() => null);

      if (!detailResponse.ok || !detailData?.ok || !detailData?.project) {
        const code = String(detailData?.error ?? '');

        if (detailResponse.status === 404) {
          throw new Error('Proyecto no encontrado.');
        }

        if (code === 'project_id_invalid') {
          throw new Error('Identificador de proyecto inválido.');
        }

        throw new Error('No se pudo cargar el proyecto.');
      }

      const currentProject = detailData.project as Project;
      const viewer = detailData.viewer as Viewer;

      setProject(currentProject);
      setParticipant(viewer?.participant ?? null);
      setAffiliateStatus(
        typeof viewer?.affiliate_status === 'string'
          ? viewer.affiliate_status
          : 'missing'
      );
      setEsPropietario(viewer?.is_owner === true);
      setCanMessage(viewer?.can_message === true);
      setError(null);

      if (!viewer?.authenticated || !viewer?.participant) {
        setThreads([]);
        setMessages([]);
        setSelectedInvestorId('');
        setSelectedInvestorName('');
        setCurrentThreadKey('');
        setSyncStatus('Actualizado');
        return;
      }

      const messagesEndpoint =
        `/api/espacio-emprendedor/proyectos/` +
        `${encodeURIComponent(projectId)}/mensajes`;

      if (viewer.is_owner === true) {
        const listResponse = await fetch(messagesEndpoint, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        const listData = await listResponse.json().catch(() => null);

        if (!listResponse.ok || !listData?.ok) {
          throw new Error('No se pudieron cargar los hilos privados.');
        }

        const threadList = mapThreads(listData.threads);
        setThreads(threadList);

        if (!destinatarioParam) {
          setMessages([]);
          setSelectedInvestorId('');
          setSelectedInvestorName('');
          setCurrentThreadKey('');
          setSyncStatus('Actualizado');
          return;
        }

        const threadResponse = await fetch(
          `${messagesEndpoint}?investor_id=${encodeURIComponent(destinatarioParam)}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          }
        );

        const threadData = await threadResponse.json().catch(() => null);

        if (threadResponse.status === 404) {
          setMessages([]);
          setSelectedInvestorId('');
          setSelectedInvestorName('');
          setCurrentThreadKey('');
          setErrorMsg('El hilo indicado no existe o no está autorizado.');
          setSyncStatus('Actualizado');
          return;
        }

        if (!threadResponse.ok || !threadData?.ok) {
          throw new Error('No se pudo cargar el hilo privado.');
        }

        setSelectedInvestorId(
          String(threadData?.investor?.id ?? '').trim()
        );
        setSelectedInvestorName(
          String(threadData?.investor?.alias ?? '').trim() ||
            'Inversionista'
        );
        setCurrentThreadKey(
          String(threadData?.thread_key ?? '').trim()
        );
        setMessages(mapMessages(threadData.messages));
        setSyncStatus('Actualizado');
        return;
      }

      setThreads([]);
      setSelectedInvestorId(viewer.participant.id);
      setSelectedInvestorName(participantLabel(viewer.participant));

      const threadResponse = await fetch(messagesEndpoint, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      const threadData = await threadResponse.json().catch(() => null);

      if (!threadResponse.ok || !threadData?.ok) {
        throw new Error('No se pudo cargar tu conversación privada.');
      }

      setCurrentThreadKey(
        String(threadData?.thread_key ?? '').trim()
      );
      setMessages(mapMessages(threadData.messages));
      setSyncStatus('Actualizado');
    } catch (loadError: any) {
      console.error('Error cargando detalle seguro:', loadError);

      if (!silent) {
        setError(
          loadError?.message ||
            'No se pudo cargar el detalle del proyecto.'
        );
      } else {
        setErrorMsg('No se pudo actualizar la conversación.');
      }

      setSyncStatus('Error de actualización');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void cargarPantalla(false);
    // La identidad y autorizacion se resuelven en el servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, destinatarioParam]);

  useEffect(() => {
    if (!participant) return;

    const intervalId = window.setInterval(() => {
      void cargarPantalla(true);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
    // Polling por API segura; no existe Realtime directo a la tabla privada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    destinatarioParam,
    participant?.id,
    esPropietario,
  ]);

  useEffect(() => {
    if (loading) return;

    if (error || !project) {
      setPageContext({
        pageId: 'espacio-emprendedor-proyecto-detalle',
        pageTitle: 'Espacio Emprendedor',
        route: `/espacio-emprendedor/proyectos/${projectId}`,
        summary: 'No se pudo cargar el detalle del proyecto emprendedor.',
        speakableSummary:
          'No se pudo cargar el detalle del proyecto emprendedor.',
        activeSection: 'proyecto-detalle-error',
        activeViewId: 'error',
        activeViewTitle: 'Detalle del proyecto no disponible',
        breadcrumb: ['Espacio Emprendedor', 'Detalle del proyecto'],
        visibleText:
          `Vista activa: detalle del proyecto no disponible.\n` +
          `Estado: error.\n` +
          `${error || 'Proyecto no encontrado'}`,
        availableActions: ['Volver'],
        selectedItemTitle: undefined,
        status: 'error',
        dynamicData: {
          projectId,
          detailLoaded: false,
          privacyMode: 'private-threads',
        },
      });
      return;
    }

    const viewMode =
      !participant
        ? 'public-only'
        : esPropietario && !selectedInvestorId
        ? 'thread-list'
        : 'thread-detail';

    const activeViewTitle =
      viewMode === 'public-only'
        ? 'Detalle público del proyecto'
        : viewMode === 'thread-list'
        ? 'Lista de hilos privados'
        : 'Hilo privado abierto';

    const userRole = !participant
      ? 'visitante'
      : esPropietario
      ? 'emprendedor'
      : 'inversionista';

    const visibleParts = [
      `Vista activa: ${activeViewTitle}.`,
      `Proyecto visible: ${project.title}.`,
      `Emprendedor visible: ${project.owner?.alias || 'No especificado'}.`,
      `Rol actual: ${userRole}.`,
      `Hilos privados visibles: ${threads.length}.`,
      `Mensajes visibles en el hilo actual: ${messages.length}.`,
    ];

    if (selectedInvestorName && esPropietario) {
      visibleParts.push(
        `Inversionista visible del hilo actual: ${selectedInvestorName}.`
      );
    }

    if (!participant) {
      visibleParts.push(
        'La conversación privada está oculta para visitantes.'
      );
    } else if (esPropietario && !selectedInvestorId) {
      visibleParts.push(
        'El emprendedor está viendo únicamente la lista de hilos autorizados.'
      );
    } else {
      visibleParts.push(
        'La conversación visible corresponde únicamente al hilo autorizado por el servidor.'
      );
    }

    setPageContext({
      pageId: 'espacio-emprendedor-proyecto-detalle',
      pageTitle: 'Espacio Emprendedor',
      route: `/espacio-emprendedor/proyectos/${projectId}`,
      summary:
        viewMode === 'public-only'
          ? 'Detalle público del proyecto. Las conversaciones privadas están protegidas.'
          : viewMode === 'thread-list'
          ? 'Detalle del proyecto con lista de hilos privados autorizados.'
          : 'Detalle del proyecto con un hilo privado autorizado.',
      speakableSummary:
        viewMode === 'public-only'
          ? `Estamos en el detalle del proyecto ${project.title}. La conversación privada está protegida.`
          : viewMode === 'thread-list'
          ? `Estamos en el detalle del proyecto ${project.title}. El emprendedor puede revisar sus hilos privados autorizados.`
          : `Estamos en el detalle del proyecto ${project.title}, dentro de una conversación privada autorizada.`,
      activeSection:
        viewMode === 'public-only'
          ? 'proyecto-detalle-publico'
          : viewMode === 'thread-list'
          ? 'proyecto-hilos-emprendedor'
          : 'proyecto-hilo-privado',
      activeViewId: viewMode,
      activeViewTitle,
      breadcrumb: [
        'Espacio Emprendedor',
        'Detalle del proyecto',
        project.title,
        activeViewTitle,
      ],
      visibleText: visibleParts.join('\n'),
      availableActions: [
        project.pdf_url ? 'Ver proyecto' : null,
        canUseConversation ? 'Enviar mensaje' : null,
        esPropietario && selectedInvestorId
          ? 'Volver a hilos'
          : null,
        'Volver',
      ].filter(Boolean) as string[],
      selectedItemTitle:
        viewMode === 'thread-detail' && selectedInvestorName
          ? `${project.title} · hilo con ${selectedInvestorName}`
          : project.title,
      status: 'ready',
      dynamicData: {
        userRole,
        viewMode,
        privacyMode: 'private-threads',
        participantLogueado: Boolean(participant),
        affiliateStatus,
        esPropietario,
        projectId,
        projectTitle: project.title,
        selectedInvestorName:
          esPropietario ? selectedInvestorName : '',
        hilosCount: threads.length,
        mensajesCount: messages.length,
        canSendMessage: canUseConversation,
        conversationPrivateByThread: true,
        syncStatus,
      },
    });
  }, [
    setPageContext,
    loading,
    error,
    project,
    projectId,
    participant,
    affiliateStatus,
    esPropietario,
    threads,
    selectedInvestorId,
    selectedInvestorName,
    messages,
    canUseConversation,
    syncStatus,
  ]);

  useEffect(() => {
    if (loading || error || !project) return;

    const viewMode =
      !participant
        ? 'public-only'
        : esPropietario && !selectedInvestorId
        ? 'thread-list'
        : 'thread-detail';

    const seenKey =
      `votoclaro_autoguide_seen:ee-project-detail:v2:` +
      `${projectId}:${viewMode}`;

    if (autoGuideSeenRef.current.has(seenKey)) {
      return;
    }

    // El guard local impide que el polling de 5 s vuelva a programar
    // la misma narracion. No escribimos sessionStorage aqui porque el
    // runtime central del asistente gestiona seenKey al procesar la guia.
    autoGuideSeenRef.current.add(seenKey);

    const text =
      viewMode === 'public-only'
        ? `Estamos en el detalle del proyecto ${project.title}. La conversación privada está protegida.`
        : viewMode === 'thread-list'
        ? `Estamos en el detalle del proyecto ${project.title}. Aquí puedes elegir uno de tus hilos privados autorizados.`
        : `Estamos en el detalle del proyecto ${project.title}, dentro de un hilo privado autorizado.`;

    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('votoclaro:guide', {
          detail: {
            action: 'SAY',
            text,
            speak: true,
            seenKey,
          },
        })
      );
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    loading,
    error,
    project,
    projectId,
    participant,
    esPropietario,
    selectedInvestorId,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  const openThreadAsOwner = (
    investorId: string,
    investorName: string
  ) => {
    setSelectedInvestorId(investorId);
    setSelectedInvestorName(investorName);

    router.push(
      `/espacio-emprendedor/proyectos/${projectId}` +
        `?destinatario=${encodeURIComponent(investorId)}`
    );
  };

  const handleSendMessage = async () => {
    const content = newMessage.trim();

    if (!project || !participant || !content) {
      return;
    }

    if (esPropietario && !selectedInvestorId) {
      setErrorMsg('Primero debes elegir el hilo del inversionista.');
      return;
    }

    setSendingMessage(true);
    setErrorMsg(null);

    try {
      const body = esPropietario
        ? {
            content,
            investor_id: selectedInvestorId,
          }
        : {
            content,
          };

      const response = await fetch(
        `/api/espacio-emprendedor/proyectos/` +
          `${encodeURIComponent(projectId)}/mensajes`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        const code = String(data?.error ?? '');

        if (response.status === 401) {
          throw new Error(
            'Tu sesión expiró. Inicia sesión nuevamente.'
          );
        }

        if (code === 'thread_not_authorized') {
          throw new Error(
            'Este hilo no está autorizado para responder.'
          );
        }

        if (code === 'message_rate_limited') {
          throw new Error(
            'Se alcanzó temporalmente el límite de mensajes.'
          );
        }

        if (
          code === 'project_not_contactable' ||
          response.status === 409
        ) {
          throw new Error(
            'El proyecto no está disponible para nuevos mensajes.'
          );
        }

        throw new Error('No se pudo enviar el mensaje.');
      }

      setNewMessage('');
      setSuccessMsg('✅ Mensaje enviado correctamente');

      window.setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);

      await cargarPantalla(true);
    } catch (sendError: any) {
      console.error('Error enviando mensaje seguro:', sendError);

      setErrorMsg(
        sendError?.message || 'No se pudo enviar el mensaje.'
      );
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

  const latestThreadAt =
    threads.length > 0 ? threads[0].lastAt : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {project.title}
          </h1>

          <button
            onClick={() => router.back()}
            className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800"
          >
            ← Volver
          </button>
        </div>

        <div className="mb-4 text-right text-xs text-slate-500">
          <span
            className={`inline-block w-2 h-2 rounded-full mr-1 ${
              syncStatus === 'Actualizado'
                ? 'bg-green-500'
                : syncStatus.startsWith('Error')
                ? 'bg-red-500'
                : 'bg-amber-500'
            }`}
          />
          Actualización segura: {syncStatus}
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
              {project.category || 'Sin categoría'}
            </span>

            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
              {[
                project.department,
                project.province,
                project.district,
              ]
                .filter(Boolean)
                .join(' - ') || 'Ubicación no especificada'}
            </span>

            <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              Inversión: {investmentLabel(project.investment_min)} -{' '}
              {investmentLabel(project.investment_max)}
            </span>

            <span className="text-xs font-semibold bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
              👁️ {project.views || 0} vistas
            </span>

            {esPropietario ? (
              <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                💬 {threads.length} hilo(s)
              </span>
            ) : null}
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">
              Descripción del proyecto
            </h2>

            <p className="text-slate-800 whitespace-pre-wrap">
              {project.summary || 'Sin descripción publicada.'}
            </p>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">
              Emprendedor
            </h2>

            <p className="text-slate-800 font-medium">
              {project.owner?.alias || 'No especificado'}
            </p>

            <p className="text-xs text-slate-500 mt-1">
              Los datos privados de contacto no se publican en esta ficha.
            </p>
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
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            💬 Conversación privada
          </h2>

          {!participant ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              La conversación privada solo se habilita para usuarios con
              sesión válida. La identidad se verifica en el servidor.
            </div>
          ) : esPropietario && !selectedInvestorId ? (
            <>
              <p className="text-sm text-slate-600 mb-4">
                Cada inversionista tiene su propio hilo privado. Solo se
                muestran los hilos autorizados por el servidor.
              </p>

              {threads.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Aún no hay hilos privados abiertos para este proyecto.
                </div>
              ) : (
                <div className="space-y-3">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() =>
                        openThreadAsOwner(
                          thread.investorId,
                          thread.investorName
                        )
                      }
                      className="w-full text-left rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {thread.investorName}
                          </p>

                          <p className="text-sm text-slate-600 mt-1">
                            {thread.lastMessage ||
                              'Sin mensaje visible'}
                          </p>

                          {thread.unreadCount > 0 ? (
                            <p className="text-xs font-semibold text-green-700 mt-2">
                              {thread.unreadCount} mensaje(s) pendiente(s)
                            </p>
                          ) : null}
                        </div>

                        <div className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(thread.lastAt)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {latestThreadAt && (
                <p className="text-xs text-slate-500 mt-4">
                  Último movimiento visible:{' '}
                  {formatDate(latestThreadAt)}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-sm text-slate-600">
                  {esPropietario
                    ? `Hilo privado con ${
                        selectedInvestorName || 'inversionista'
                      }`
                    : 'Tu hilo privado con el emprendedor'}
                </p>

                {esPropietario ? (
                  <button
                    onClick={() =>
                      router.push(
                        `/espacio-emprendedor/proyectos/${projectId}`
                      )
                    }
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
                  messages.map((message) => {
                    const ownMessage =
                      (message.sender_type === 'emprendedor' &&
                        esPropietario) ||
                      (message.sender_type === 'inversionista' &&
                        !esPropietario);

                    const author =
                      message.sender_type === 'emprendedor'
                        ? project.owner?.alias || 'Emprendedor'
                        : esPropietario
                        ? selectedInvestorName || 'Inversionista'
                        : participantLabel(participant);

                    return (
                      <div
                        key={message.id}
                        className={`p-3 rounded-xl ${
                          ownMessage
                            ? 'bg-green-100 ml-8'
                            : 'bg-slate-200 mr-8'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-semibold text-slate-700">
                            {author}
                            {message.sender_type === 'inversionista' ? (
                              <span className="ml-1 text-green-600">
                                💰
                              </span>
                            ) : (
                              <span className="ml-1 text-blue-600">
                                🚀
                              </span>
                            )}
                          </span>

                          <span className="text-xs text-slate-400">
                            {formatDate(message.created_at)}
                          </span>
                        </div>

                        <p className="text-sm text-slate-800 whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {canUseConversation ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <textarea
                    value={newMessage}
                    onChange={(event) =>
                      setNewMessage(event.target.value)
                    }
                    maxLength={2000}
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
                    disabled={
                      sendingMessage || !newMessage.trim()
                    }
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
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Este proyecto no está habilitado para enviar mensajes
                  desde tu sesión actual.
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/espacio-emprendedor"
            className="text-sm text-green-700 hover:underline"
          >
            Volver al Espacio Emprendedor
          </Link>
        </div>
      </div>
    </main>
  );
}