'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

type Project = {
  id: string;
  name: string;
  category: string;
  objective: string;
  description: string;
  district: string;
  department: string;
  pdf_url: string;
  leader_id: string;
  beneficiary_count: number;
  created_at: string;
  status: string;
  requested_budget?: number | null;
  budget_category?: string | null;
  minimum_supports_required?: number | null;
  eligible_for_final_review?: boolean | null;
  leader: {
    id: string;
    alias: string;
  } | null;
};

type ForumPost = {
  id: string;
  content: string;
  created_at: string;
  participant: {
    alias: string;
  };
};

const DEFAULT_MIN_SUPPORTS_REQUIRED = 100;

const EVALUATION_WEIGHTS = {
  citizenSupport: 40,
  projectQuality: 60,
};

const EVALUATION_CRITERIA = [
  'Impacto comunitario',
  'Claridad del problema y la solución',
  'Viabilidad técnica y presupuestal',
  'Sostenibilidad del beneficio',
];

function getBudgetCategoryLabel(category: string | null | undefined): string {
  if (category === 'hasta_10000') return 'Hasta S/10,000';
  if (category === 'hasta_20000') return 'Hasta S/20,000';
  if (category === 'hasta_30000') return 'Hasta S/30,000';
  return 'Sin categoría presupuestal';
}

function getRequestedBudgetLabel(value: number | null | undefined): string {
  if (value == null) return 'No especificado';

  return `S/${Number(value).toLocaleString('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getLeaderPublicName(project: Project | null): string {
  const alias = String(project?.leader?.alias || '').trim();
  return alias || 'No publicado';
}

function hasForbiddenForumContent(text: string): boolean {
  const value = String(text || '').toLowerCase();

  const forbiddenWords = [
    'mierda',
    'carajo',
    'puta',
    'puto',
    'imbecil',
    'idiota',
    'cojudo',
    'cojuda',
    'pendejo',
    'pendeja',
    'verga',
    'cabron',
    'cabrona',
  ];

  return forbiddenWords.some((word) => value.includes(word));
}

function hasLinks(text: string): boolean {
  return /https?:\/\/|www\./i.test(text);
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [supporting, setSupporting] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [newPost, setNewPost] = useState('');
  const [sendingPost, setSendingPost] = useState(false);
  const [activeCycle, setActiveCycle] = useState<any>(null);

  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [uiMessageType, setUiMessageType] = useState<'success' | 'warning' | 'error'>('warning');

  const showMessage = (
    message: string,
    type: 'success' | 'warning' | 'error' = 'warning'
  ) => {
    setUiMessage(message);
    setUiMessageType(type);
  };

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
            .select('id, alias, device_id')
            .eq('device_id', deviceId)
            .maybeSingle();

          currentParticipant = pData;
          setParticipant(currentParticipant);
        }

        const { data: cycleData } = await supabase
          .from('project_cycles')
          .select('id, is_active')
          .eq('is_active', true)
          .maybeSingle();

        setActiveCycle(cycleData);

        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select(`
            id,
            name,
            category,
            objective,
            description,
            district,
            department,
            pdf_url,
            leader_id,
            beneficiary_count,
            created_at,
            status,
            requested_budget,
            budget_category,
            minimum_supports_required,
            eligible_for_final_review,
            leader:project_participants!leader_id (
              id,
              alias
            )
          `)
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;

        const transformedProject: Project = {
          ...projectData,
          leader:
            projectData.leader && projectData.leader.length > 0
              ? projectData.leader[0]
              : null,
        };

        setProject(transformedProject);

        if (currentParticipant && cycleData) {
          const { data: supportData } = await supabase
            .from('project_supports')
            .select('id')
            .eq('project_id', projectId)
            .eq('participant_id', currentParticipant.id)
            .eq('cycle_id', cycleData.id)
            .maybeSingle();

          setSupporting(!!supportData);
        }

        const { data: forumData } = await supabase
          .from('project_forum_posts')
          .select(`
            id,
            content,
            created_at,
            participant:project_participants!participant_id (
              alias
            )
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        const transformedForum: ForumPost[] = (forumData || []).map((post: any) => ({
          ...post,
          participant:
            post.participant && post.participant.length > 0
              ? post.participant[0]
              : { alias: 'Anónimo' },
        }));

        setForumPosts(transformedForum);
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

  const handleSupport = async () => {
    setUiMessage(null);

    if (!participant) {
      showMessage('Debes registrarte para apoyar proyectos.', 'warning');
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    if (!activeCycle) {
      showMessage('No hay un ciclo activo en este momento.', 'warning');
      return;
    }

    if (supporting) {
      showMessage('Ya estás apoyando este proyecto.', 'warning');
      return;
    }

    const { data: existingSupport } = await supabase
      .from('project_supports')
      .select('id, project_id')
      .eq('participant_id', participant.id)
      .eq('cycle_id', activeCycle.id)
      .maybeSingle();

    if (existingSupport) {
      showMessage('Solo puedes apoyar un proyecto por ciclo. Ya estás apoyando otro proyecto.', 'warning');
      return;
    }

    setSupportLoading(true);

    try {
      const { error } = await supabase
        .from('project_supports')
        .insert({
          project_id: projectId,
          participant_id: participant.id,
          cycle_id: activeCycle.id,
          approved_by: project?.leader_id,
        });

      if (error) throw error;

      const nextBeneficiaryCount = (project?.beneficiary_count || 0) + 1;
      const minSupports = project?.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED;
      const nextEligible = nextBeneficiaryCount >= minSupports;

      if (project) {
        const { error: updateProjectError } = await supabase
          .from('projects')
          .update({
            beneficiary_count: nextBeneficiaryCount,
            eligible_for_final_review: nextEligible,
          })
          .eq('id', project.id);

        if (updateProjectError) {
          console.error('Error actualizando el proyecto tras el apoyo:', updateProjectError);
        }
      }

      setSupporting(true);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              beneficiary_count: nextBeneficiaryCount,
              eligible_for_final_review: nextEligible,
            }
          : null
      );

      showMessage('¡Gracias por apoyar este proyecto! Tu apoyo será considerado dentro de las reglas del ciclo activo.', 'success');
    } catch (err: any) {
      console.error('Error al apoyar:', err);
      showMessage(err.message || 'Error al apoyar el proyecto', 'error');
    } finally {
      setSupportLoading(false);
    }
  };

  const handlePost = async () => {
    setUiMessage(null);

    if (!participant) {
      showMessage('Debes registrarte para participar en el foro.', 'warning');
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    const cleanPost = newPost.trim();

    if (!cleanPost) return;

    if (cleanPost.length < 5) {
      showMessage('El comentario debe tener al menos 5 caracteres.', 'warning');
      return;
    }

    if (cleanPost.length > 800) {
      showMessage('El comentario no debe superar los 800 caracteres.', 'warning');
      return;
    }

    if (hasLinks(cleanPost)) {
      showMessage('No está permitido incluir enlaces en el foro.', 'warning');
      return;
    }

    if (hasForbiddenForumContent(cleanPost)) {
      showMessage('Tu comentario contiene palabras no permitidas.', 'warning');
      return;
    }

    setSendingPost(true);

    try {
      const { error } = await supabase
        .from('project_forum_posts')
        .insert({
          project_id: projectId,
          participant_id: participant.id,
          content: cleanPost,
        });

      if (error) throw error;

      const newPostObj: ForumPost = {
        id: Date.now().toString(),
        content: cleanPost,
        created_at: new Date().toISOString(),
        participant: { alias: participant.alias || 'Anónimo' },
      };

      setForumPosts((prev) => [...prev, newPostObj]);
      setNewPost('');
      showMessage('Tu comentario fue publicado correctamente.', 'success');
    } catch (err: any) {
      console.error('Error al publicar:', err);
      showMessage(err.message || 'Error al publicar', 'error');
    } finally {
      setSendingPost(false);
    }
  };

  useEffect(() => {
    const forumCount = forumPosts.length;
    const lastPost = forumPosts.length ? forumPosts[forumPosts.length - 1] : null;
    const canSupport = !!project && project.status === 'active';
    const canComment = !!participant;
    const supportBlockVisible = !!project && project.status === 'active';
    const pdfVisible = !!project?.pdf_url;

    const minSupportsRequired = project?.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED;
    const beneficiaryCount = project?.beneficiary_count || 0;
    const supportsRemaining = Math.max(minSupportsRequired - beneficiaryCount, 0);
    const meetsMinimumSupports = beneficiaryCount >= minSupportsRequired;

    const eligibleForFinalReview =
      project?.eligible_for_final_review != null
        ? Boolean(project.eligible_for_final_review)
        : meetsMinimumSupports;

    const budgetCategoryLabel = getBudgetCategoryLabel(project?.budget_category);
    const requestedBudgetLabel = getRequestedBudgetLabel(project?.requested_budget);

    const activeSection = loading
      ? 'proyecto-detalle-cargando'
      : error || !project
      ? 'proyecto-detalle-error'
      : sendingPost
      ? 'foro-publicando'
      : supportLoading
      ? 'apoyo-procesando'
      : 'proyecto-detalle-visible';

    const activeViewId = loading
      ? 'loading'
      : error || !project
      ? 'error'
      : 'detail';

    const activeViewTitle = loading
      ? 'Cargando detalle del proyecto'
      : error || !project
      ? 'Error en detalle del proyecto'
      : 'Detalle del proyecto ciudadano';

    const visibleParts: string[] = [];

    if (loading) {
      visibleParts.push('El detalle del proyecto ciudadano está cargando.');
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}.`);
    }

    if (uiMessage) {
      visibleParts.push(`Aviso visible: ${uiMessage}.`);
    }

    if (project) {
      visibleParts.push('Hay un proyecto ciudadano visible en esta pantalla.');
      visibleParts.push(`Categoría temática visible: ${project.category}.`);
      visibleParts.push(`Ubicación visible: ${project.department} - ${project.district}.`);
      visibleParts.push(`Estado visible del proyecto: ${project.status}.`);
      visibleParts.push(`Apoyos internos visibles: ${beneficiaryCount}.`);
      visibleParts.push(`Apoyos mínimos requeridos: ${minSupportsRequired}.`);
      visibleParts.push(`Apoyos faltantes para evaluación final: ${supportsRemaining}.`);
      visibleParts.push(
        eligibleForFinalReview
          ? 'El proyecto alcanza el umbral referencial para evaluación final, sujeto a validación.'
          : 'El proyecto todavía no alcanza el umbral referencial para evaluación final.'
      );
      visibleParts.push(`Monto solicitado visible: ${requestedBudgetLabel}.`);
      visibleParts.push(`Categoría presupuestal visible: ${budgetCategoryLabel}.`);
      visibleParts.push(
        `Ponderación referencial visible: ${EVALUATION_WEIGHTS.citizenSupport} puntos por respaldo ciudadano y ${EVALUATION_WEIGHTS.projectQuality} puntos por calidad del proyecto, sujeta a validación.`
      );
      visibleParts.push(`Criterios visibles de calidad: ${EVALUATION_CRITERIA.join(', ')}.`);
      visibleParts.push('El objetivo y la descripción del proyecto están visibles para el usuario, pero no se envían completos al contexto del asistente.');

      if (project.leader?.alias) {
        visibleParts.push(`Alias público del líder visible: ${project.leader.alias}.`);
      } else {
        visibleParts.push('El líder del proyecto no tiene alias público visible.');
      }

      if (pdfVisible) {
        visibleParts.push('Hay un PDF visible para descargar.');
      } else {
        visibleParts.push('No hay un PDF visible para descargar.');
      }
    }

    if (supportBlockVisible) {
      if (supporting) {
        visibleParts.push('El usuario ya aparece apoyando este proyecto.');
      } else {
        visibleParts.push('El bloque de apoyo está visible y el apoyo todavía no aparece registrado para este usuario.');
      }
    } else if (project && project.status !== 'active') {
      visibleParts.push('El bloque de apoyo no está disponible porque el proyecto no está activo.');
    }

    if (participant) {
      visibleParts.push('Hay un participante registrado en esta sesión, sin exponer sus datos personales completos al asistente.');
    } else if (!loading) {
      visibleParts.push('No aparece un participante registrado en esta pantalla.');
    }

    visibleParts.push(`Cantidad de mensajes visibles en el foro: ${forumCount}.`);

    if (lastPost) {
      visibleParts.push('Hay un último comentario visible en el foro, sin exponer su contenido completo al asistente.');
      visibleParts.push(`Autor visible del último comentario: ${lastPost.participant?.alias || 'Anónimo'}.`);
    }

    if (newPost.trim()) {
      visibleParts.push('Hay texto escrito en el borrador del foro, sin exponer su contenido completo al asistente.');
    }

    if (supportLoading) {
      visibleParts.push('Se está procesando el apoyo al proyecto.');
    }

    if (sendingPost) {
      visibleParts.push('Se está publicando un comentario en el foro.');
    }

    visibleParts.push('Los apoyos ciudadanos son apoyos internos de participación, no votos oficiales ni resultados electorales.');
    visibleParts.push('Alcanzar el umbral de apoyos no garantiza premio, financiamiento ni aprobación automática.');
    visibleParts.push('Cualquier reconocimiento, apoyo o premio queda sujeto a bases, validación y disponibilidad de la organización.');

    const availableActions = [
      'Volver a proyectos',
      pdfVisible ? 'Descargar documento del proyecto' : null,
      supportBlockVisible ? 'Apoyar este proyecto' : null,
      participant ? 'Publicar comentario' : 'Registrarme para participar',
    ].filter(Boolean) as string[];

    const suggestedPrompts =
      loading || error || !project
        ? [
            {
              id: 'pc-detalle-1',
              label: '¿Qué pasa aquí?',
              question: '¿Qué pasa en esta pantalla del proyecto?',
            },
          ]
        : [
            {
              id: 'pc-detalle-1',
              label: 'Proyecto abierto',
              question: '¿Qué información general muestra esta pantalla del proyecto?',
            },
            {
              id: 'pc-detalle-2',
              label: 'Apoyos internos',
              question: '¿Cuántos apoyos internos visibles tiene este proyecto?',
            },
            {
              id: 'pc-detalle-3',
              label: 'Apoyos faltantes',
              question: '¿Cuántos apoyos le faltan a este proyecto para alcanzar el umbral de evaluación final?',
            },
            {
              id: 'pc-detalle-4',
              label: 'Evaluación final',
              question: '¿Este proyecto ya alcanza el umbral referencial para evaluación final?',
            },
            {
              id: 'pc-detalle-5',
              label: 'Categoría presupuestal',
              question: '¿Qué categoría presupuestal y qué monto solicitado tiene este proyecto?',
            },
          ];

    const summary = loading
      ? 'Pantalla de detalle de proyecto ciudadano cargando información del proyecto, apoyos y foro.'
      : error || !project
      ? 'Pantalla de detalle de proyecto ciudadano con error visible o proyecto no encontrado.'
      : 'Pantalla de detalle de proyecto ciudadano con información pública del proyecto, apoyos internos visibles, umbral referencial para evaluación final y foro visible.';

    setPageContext({
      pageId: 'proyecto-ciudadano-proyecto-detalle',
      pageTitle: 'Detalle de proyecto ciudadano',
      route: projectId ? `/proyecto-ciudadano/proyectos/${projectId}` : '/proyecto-ciudadano/proyectos/[id]',
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Proyecto Ciudadano', 'Proyectos', 'Detalle'],
      visibleSections: [
        'cabecera',
        'informacion-del-proyecto',
        'reglas-de-evaluacion',
        supportBlockVisible ? 'bloque-de-apoyo' : null,
        'foro-de-discusion',
      ].filter(Boolean) as string[],
      visibleActions: availableActions,
      availableActions,
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: project ? 'Proyecto ciudadano visible' : undefined,
      status: loading ? 'loading' : error ? 'error' : 'ready',
      resultsSummary: `Foro visible con ${forumCount} comentario${forumCount === 1 ? '' : 's'}.`,
      suggestedPrompts,
      dynamicData: {
        projectId: project?.id || projectId || null,
        projectVisible: !!project,
        projectNameVisible: !!project?.name,
        category: project?.category || null,
        department: project?.department || null,
        district: project?.district || null,
        projectStatus: project?.status || null,
        beneficiaryCount,
        minimumSupportsRequired: minSupportsRequired,
        supportsRemaining,
        meetsMinimumSupports,
        eligibleForFinalReview,
        requestedBudget: project?.requested_budget ?? null,
        requestedBudgetLabel,
        budgetCategory: project?.budget_category || null,
        budgetCategoryLabel,
        evaluationWeights: EVALUATION_WEIGHTS,
        evaluationCriteria: EVALUATION_CRITERIA,
        leaderVisible: !!project?.leader,
        leaderAlias: project?.leader?.alias || null,
        leaderPrivateDataProtected: true,
        pdfVisible,
        participantVisible: !!participant,
        participantDataProtected: true,
        activeCycleVisible: !!activeCycle,
        supporting,
        supportBlockVisible,
        supportLoading,
        forumCount,
        lastForumPostProtected: !!lastPost,
        lastForumPostAuthorAlias: lastPost?.participant?.alias || null,
        newPostDraftProtected: !!newPost.trim(),
        sendingPost,
        canSupport,
        canComment,
        uiMessage: uiMessage || null,
        uiMessageType,
        error: error || null,
        supportRule:
          'Los apoyos ciudadanos son apoyos internos, no votos oficiales ni resultados electorales.',
        eligibilityRule:
          'Alcanzar el umbral de apoyos no garantiza premio, financiamiento ni aprobación automática.',
      },
      contextVersion: 'pc-proyecto-detalle-v4',
    });
  }, [
    setPageContext,
    projectId,
    project,
    loading,
    error,
    participant,
    supporting,
    supportLoading,
    forumPosts,
    newPost,
    sendingPost,
    activeCycle,
    uiMessage,
    uiMessageType,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

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
            type="button"
            onClick={() => router.push('/proyecto-ciudadano/proyectos')}
            className="text-green-700 hover:underline cursor-pointer relative z-10"
          >
            ← Volver a proyectos
          </button>
        </div>
      </main>
    );
  }

  const minSupportsRequired = project.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED;
  const beneficiaryCount = project.beneficiary_count || 0;
  const supportsRemaining = Math.max(minSupportsRequired - beneficiaryCount, 0);

  const eligibleForFinalReview =
    project.eligible_for_final_review != null
      ? Boolean(project.eligible_for_final_review)
      : beneficiaryCount >= minSupportsRequired;

  const budgetCategoryLabel = getBudgetCategoryLabel(project.budget_category);
  const requestedBudgetLabel = getRequestedBudgetLabel(project.requested_budget);

  const uiMessageClasses =
    uiMessageType === 'success'
      ? 'bg-green-100 border-green-400 text-green-800'
      : uiMessageType === 'error'
      ? 'bg-red-100 border-red-400 text-red-700'
      : 'bg-amber-100 border-amber-400 text-amber-800';

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6 gap-4">
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <button
            type="button"
            onClick={() => router.push('/proyecto-ciudadano/proyectos')}
            className="text-sm text-slate-600 hover:underline cursor-pointer relative z-10"
          >
            ← Volver a proyectos
          </button>
        </div>

        {uiMessage && (
          <div className={`border rounded-xl p-4 mb-4 text-sm ${uiMessageClasses}`}>
            {uiMessage}
          </div>
        )}

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
              {project.category}
            </span>

            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
              {project.department} - {project.district}
            </span>

            <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {beneficiaryCount} apoyos internos
            </span>

            <span className="text-xs font-semibold bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">
              {budgetCategoryLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 mb-1">Monto solicitado</p>
              <p className="text-sm font-bold text-slate-900">{requestedBudgetLabel}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 mb-1">Apoyos para evaluación final</p>
              <p className="text-sm font-bold text-slate-900">
                {beneficiaryCount} / {minSupportsRequired}
              </p>
            </div>
          </div>

          <div
            className={`mb-4 rounded-xl p-4 border ${
              eligibleForFinalReview ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                eligibleForFinalReview ? 'text-green-800' : 'text-amber-800'
              }`}
            >
              {eligibleForFinalReview
                ? '✅ Este proyecto alcanza el umbral referencial para evaluación final.'
                : `⏳ A este proyecto le faltan ${supportsRemaining} apoyos para alcanzar el umbral de evaluación final.`}
            </p>

            <p className="text-xs text-slate-600 mt-2">
              Alcanzar el umbral de apoyos no garantiza premio, financiamiento ni aprobación automática. Todo queda sujeto a validación de la organización y reglas de la convocatoria.
            </p>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Objetivo general</h2>
            <p className="text-slate-800">{project.objective}</p>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Descripción</h2>
            <p className="text-slate-800 whitespace-pre-wrap">{project.description}</p>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Líder del proyecto</h2>
            <p className="text-slate-800">{getLeaderPublicName(project)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Por privacidad, no se muestran datos personales de contacto del líder.
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
                📄 Ver documento público del proyecto (PDF)
              </a>
            </div>
          )}

          <div className="mt-4 text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-300">
            <strong>📊 Evaluación del proyecto:</strong> Para entrar a evaluación final, este proyecto necesita al menos{' '}
            <strong>{minSupportsRequired} apoyos válidos</strong>. La evaluación referencial combina{' '}
            <strong>{EVALUATION_WEIGHTS.citizenSupport} puntos por respaldo ciudadano</strong> y{' '}
            <strong>{EVALUATION_WEIGHTS.projectQuality} puntos por calidad del proyecto</strong>. La calidad se evalúa por impacto comunitario,
            claridad del problema y la solución, viabilidad técnica y presupuestal, y sostenibilidad del beneficio.
          </div>

          {project.status === 'active' && (
            <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
              <strong>⚠️ Aviso sobre reconocimientos:</strong> Cualquier premio, fondo, apoyo, reconocimiento o entrega de materiales
              estará sujeto a las bases oficiales de la convocatoria, validación del proyecto, disponibilidad presupuestal y verificación
              de la organización. No se garantiza entrega automática de dinero ni beneficio económico directo.
            </div>
          )}

          {project.status === 'active' && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSupport}
                disabled={supportLoading || supporting}
                className={`w-full py-3 rounded-xl font-semibold transition ${
                  supporting
                    ? 'bg-green-100 text-green-700 cursor-default'
                    : 'bg-green-700 text-white hover:bg-green-800'
                }`}
              >
                {supportLoading
                  ? 'Procesando...'
                  : supporting
                  ? '✓ Ya estás apoyando este proyecto'
                  : '🤝 Apoyar este proyecto'}
              </button>

              <p className="text-xs text-slate-500 mt-2 text-center">
                El apoyo es interno de la plataforma. No es voto oficial ni resultado electoral.
              </p>

              {!participant && (
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Para apoyar, primero debes{' '}
                  <Link href="/proyecto-ciudadano/registro" className="text-green-700 underline">
                    registrarte
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Foro de discusión</h2>
          <p className="text-sm text-slate-600 mb-4">
            Participa con ideas y preguntas sobre este proyecto. No publiques datos personales, enlaces ni contenido ofensivo.
          </p>

          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
            {forumPosts.length === 0 ? (
              <p className="text-slate-500 text-sm">No hay comentarios aún. Sé el primero en participar.</p>
            ) : (
              forumPosts.map((post) => (
                <div key={post.id} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-slate-700">
                      {post.participant?.alias || 'Anónimo'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{post.content}</p>
                </div>
              ))
            )}
          </div>

          {participant ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="Escribe tu comentario o pregunta..."
                rows={2}
                maxLength={800}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              />

              <button
                type="button"
                onClick={handlePost}
                disabled={sendingPost || !newPost.trim()}
                className="w-full sm:w-auto bg-green-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
              >
                {sendingPost ? 'Enviando...' : 'Publicar'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center">
              <Link href="/proyecto-ciudadano/registro" className="text-green-700 underline">
                Regístrate
              </Link>{' '}
              para participar en el foro.
            </p>
          )}

          {participant && (
            <p className="text-xs text-slate-500 mt-3">
              Máximo 800 caracteres. No incluyas enlaces, datos personales ni expresiones ofensivas.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}