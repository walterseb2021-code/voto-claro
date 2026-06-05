'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

type ConversationMessage = {
  id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_alias: string;
  is_from_me: boolean;
};

type ProfessionalConversation = {
  thread_key: string;
  professional_id: string;
  professional_name: string;
  professional_type: string;
  codigo_profesional: string;
  last_message_at: string;
  messages: ConversationMessage[];
};

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('vc_device_id') || '';
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
  });
}

export default function MisMensajesProfesionalesPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [conversations, setConversations] = useState<ProfessionalConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyLoadingKey, setReplyLoadingKey] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<Record<string, string>>({});
  const [replySuccess, setReplySuccess] = useState<Record<string, string>>({});

  const loadConversations = async () => {
    const deviceId = getDeviceId();

    if (!deviceId) {
      setError('Debes registrarte o iniciar sesión para ver tus conversaciones.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/espacio-emprendedor/profesionales/mis-mensajes?device_id=${encodeURIComponent(deviceId)}`,
        {
          cache: 'no-store',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudieron cargar tus conversaciones.');
      }

      setConversations(data.conversations || []);
    } catch (err: any) {
      console.error('Error cargando conversaciones:', err);
      setError(err.message || 'No se pudieron cargar tus conversaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  const handleReplyConversation = async (conversation: ProfessionalConversation) => {
    const reply = String(replyDrafts[conversation.thread_key] || '').trim();

    setReplyError((prev) => ({
      ...prev,
      [conversation.thread_key]: '',
    }));

    setReplySuccess((prev) => ({
      ...prev,
      [conversation.thread_key]: '',
    }));

    if (reply.length < 10) {
      setReplyError((prev) => ({
        ...prev,
        [conversation.thread_key]: 'La respuesta debe tener al menos 10 caracteres.',
      }));
      return;
    }

    const deviceId = getDeviceId();

    if (!deviceId) {
      setReplyError((prev) => ({
        ...prev,
        [conversation.thread_key]: 'No se pudo identificar tu sesión. Inicia sesión nuevamente.',
      }));
      return;
    }

    setReplyLoadingKey(conversation.thread_key);

    try {
      const res = await fetch('/api/espacio-emprendedor/profesionales/mis-mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          thread_key: conversation.thread_key,
          professional_id: conversation.professional_id,
          content: reply,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo enviar la respuesta.');
      }

      setReplyDrafts((prev) => ({
        ...prev,
        [conversation.thread_key]: '',
      }));

      setReplySuccess((prev) => ({
        ...prev,
        [conversation.thread_key]: data?.message || 'Respuesta enviada correctamente.',
      }));

      await loadConversations();
    } catch (err: any) {
      setReplyError((prev) => ({
        ...prev,
        [conversation.thread_key]: err.message || 'No se pudo enviar la respuesta.',
      }));
    } finally {
      setReplyLoadingKey(null);
    }
  };

  useEffect(() => {
    const visibleParts = [
      'Pantalla visible: Mis mensajes con profesionales asesores.',
      'Esta pantalla permite al usuario interesado revisar conversaciones privadas con profesionales registrados.',
      `Cantidad de conversaciones visibles: ${conversations.length}.`,
      loading
        ? 'Las conversaciones están cargando.'
        : 'La carga de conversaciones terminó.',
      error ? `Error visible: ${error}.` : 'No hay error visible.',
      'Las conversaciones son internas entre las partes y no muestran DNI, correo ni celular.',
    ];

    setPageContext({
      pageId: 'espacio-emprendedor-profesionales-mis-mensajes',
      pageTitle: 'Mis mensajes con profesionales',
      route: '/espacio-emprendedor/apoyo/profesionales/mis-mensajes',
      summary:
        'Pantalla de conversaciones privadas del usuario interesado con profesionales asesores registrados.',
      speakableSummary:
        'Estás en Mis mensajes con profesionales. Aquí puedes revisar las respuestas de los profesionales asesores y continuar la conversación dentro de la plataforma.',
      activeSection: loading
        ? 'mensajes-cargando'
        : error
        ? 'mensajes-error'
        : conversations.length === 0
        ? 'mensajes-vacio'
        : 'mensajes-conversaciones',
      activeViewId: loading
        ? 'loading'
        : error
        ? 'error'
        : conversations.length === 0
        ? 'empty'
        : 'conversations',
      activeViewTitle: 'Mis mensajes con profesionales',
      breadcrumb: ['Espacio Emprendedor', 'Profesionales', 'Mis mensajes'],
      visibleSections: ['cabecera', 'conversaciones', 'respuestas', 'avisos'],
      visibleActions: [
        'Volver a profesionales',
        'Recargar conversaciones',
        'Responder conversación',
      ],
      availableActions: [
        'Volver a profesionales',
        'Recargar conversaciones',
        'Responder conversación',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: conversations[0]?.professional_name || undefined,
      status: loading ? 'loading' : error ? 'error' : 'ready',
      dynamicData: {
        conversationsCount: conversations.length,
        loading,
        error: error || null,
        replyLoadingKey,
        privateConversationMode: true,
      },
      contextVersion: 'ee-profesionales-mis-mensajes-v1',
    });

    return () => {
      clearPageContext();
    };
  }, [
    setPageContext,
    clearPageContext,
    conversations,
    loading,
    error,
    replyLoadingKey,
  ]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Mis mensajes con profesionales
          </h1>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/espacio-emprendedor/apoyo/profesionales"
              className="bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition"
            >
              ← Profesionales
            </Link>

            <button
              type="button"
              onClick={loadConversations}
              disabled={loading}
              className="bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition disabled:opacity-50"
            >
              {loading ? 'Actualizando...' : 'Recargar'}
            </button>
          </div>
        </div>

        <section className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm mb-6">
          <p className="text-slate-700 text-lg font-semibold">
            💬 Conversaciones privadas con profesionales asesores.
          </p>

          <p className="text-slate-600 text-sm mt-3">
            Aquí puedes revisar las respuestas de los profesionales que contactaste y continuar la conversación dentro de la plataforma.
          </p>

          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> Voto Claro no certifica profesionales, no garantiza servicios,
            honorarios, resultados ni acuerdos. Evalúa con cuidado antes de compartir datos personales,
            firmar documentos, realizar pagos o asumir compromisos.
          </div>
        </section>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-slate-600 text-sm">Cargando conversaciones...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-slate-600 text-sm">
              Todavía no tienes conversaciones con profesionales.
            </p>
            <Link
              href="/espacio-emprendedor/apoyo/profesionales"
              className="inline-block mt-4 bg-green-700 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-green-800"
            >
              Buscar profesionales
            </Link>
          </div>
        ) : (
          <section className="space-y-4">
            {conversations.map((conversation) => (
              <div
                key={conversation.thread_key}
                className="bg-white rounded-2xl border-2 border-blue-600 p-5 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {conversation.professional_name}
                    </h2>
                    <p className="text-sm text-blue-700 font-semibold">
                      {conversation.professional_type || 'Profesional asesor'}
                    </p>
                    {conversation.codigo_profesional && (
                      <p className="text-xs text-slate-500 mt-1">
                        Código público: {conversation.codigo_profesional}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-slate-500">
                    Último movimiento: {formatDate(conversation.last_message_at)}
                  </p>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto rounded-xl bg-slate-50 border border-slate-200 p-3">
                  {conversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-xl p-3 text-sm ${
                        msg.is_from_me
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-blue-50 border border-blue-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 mb-1">
                        <p className="font-semibold text-slate-800">
                          {msg.is_from_me ? 'Tú' : msg.sender_alias}
                        </p>

                        <p className="text-[11px] text-slate-500">
                          {formatDate(msg.created_at)}
                        </p>
                      </div>

                      <p className="text-slate-700 whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>

                {replyError[conversation.thread_key] && (
                  <p className="text-xs text-red-700 mt-2">
                    {replyError[conversation.thread_key]}
                  </p>
                )}

                {replySuccess[conversation.thread_key] && (
                  <p className="text-xs text-green-700 mt-2">
                    {replySuccess[conversation.thread_key]}
                  </p>
                )}

                <div className="mt-3">
                  <textarea
                    value={replyDrafts[conversation.thread_key] || ''}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({
                        ...prev,
                        [conversation.thread_key]: e.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="Escribe tu respuesta al profesional..."
                    className="w-full border-2 border-slate-300 rounded-xl px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => handleReplyConversation(conversation)}
                    disabled={replyLoadingKey === conversation.thread_key}
                    className="mt-2 w-full bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition disabled:opacity-50"
                  >
                    {replyLoadingKey === conversation.thread_key
                      ? 'Enviando respuesta...'
                      : 'Responder'}
                  </button>
                </div>

                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-2 mt-3">
                  Esta conversación es interna entre las partes. Evalúa la información antes de compartir datos personales,
                  firmar documentos, realizar pagos o asumir compromisos.
                </p>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}