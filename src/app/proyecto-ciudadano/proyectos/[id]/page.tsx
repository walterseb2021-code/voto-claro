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
    full_name: string;
    email: string;
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

        const { data: cycleData } = await supabase
          .from('project_cycles')
          .select('*')
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
              alias,
              full_name,
              email
            )
          `)
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;

        const transformedProject = {
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

        const transformedForum = (forumData || []).map((post: any) => ({
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
    if (!participant) {
      alert('Debes registrarte para apoyar proyectos.');
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    if (!activeCycle) {
      alert('No hay un ciclo activo en este momento.');
      return;
    }

    if (supporting) {
      alert('Ya estás apoyando este proyecto.');
      return;
    }

    const { data: existingSupport } = await supabase
      .from('project_supports')
      .select('id, project_id')
      .eq('participant_id', participant.id)
      .eq('cycle_id', activeCycle.id)
      .maybeSingle();

    if (existingSupport) {
      alert('Solo puedes apoyar un proyecto por ciclo. Ya estás apoyando otro proyecto.');
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
      alert('¡Gracias por apoyar este proyecto!');
    } catch (err: any) {
      console.error('Error al apoyar:', err);
      alert(err.message || 'Error al apoyar el proyecto');
    } finally {
      setSupportLoading(false);
    }
  };

  const handlePost = async () => {
    if (!participant) {
      alert('Debes registrarte para participar en el foro.');
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    if (!newPost.trim()) return;

    setSendingPost(true);
    try {
      const { error } = await supabase
        .from('project_forum_posts')
        .insert({
          project_id: projectId,
          participant_id: participant.id,
          content: newPost.trim(),
        });

      if (error) throw error;

      const newPostObj: ForumPost = {
        id: Date.now().toString(),
        content: newPost.trim(),
        created_at: new Date().toISOString(),
        participant: { alias: participant.alias || 'Anónimo' },
      };

      setForumPosts((prev) => [...prev, newPostObj]);
      setNewPost('');
    } catch (err: any) {
      console.error('Error al publicar:', err);
      alert(err.message || 'Error al publicar');
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
    const requestedBudgetLabel =
      project?.requested_budget != null
        ? `S/${Number(project.requested_budget).toLocaleString('es-PE', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })}`
        : 'No especificado';

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

    if (project) {
      visibleParts.push(`Proyecto visible: ${project.name}.`);
      visibleParts.push(`Categoría temática visible: ${project.category}.`);
      visibleParts.push(`Ubicación visible: ${project.department} - ${project.district}.`);
      visibleParts.push(`Objetivo visible: ${project.objective}.`);
      visibleParts.push(`Estado visible del proyecto: ${project.status}.`);
      visibleParts.push(`Apoyos visibles: ${beneficiaryCount}.`);
      visibleParts.push(`Apoyos mínimos requeridos: ${minSupportsRequired}.`);
      visibleParts.push(`Apoyos faltantes para evaluación final: ${supportsRemaining}.`);
      visibleParts.push(
        eligibleForFinalReview
          ? 'El proyecto ya es elegible para evaluación final.'
          : 'El proyecto todavía no es elegible para evaluación final.'
      );
      visibleParts.push(`Monto solicitado visible: ${requestedBudgetLabel}.`);
      visibleParts.push(`Categoría presupuestal visible: ${budgetCategoryLabel}.`);
      visibleParts.push(
        `Ponderación visible: ${EVALUATION_WEIGHTS.citizenSupport} puntos por respaldo ciudadano y ${EVALUATION_WEIGHTS.projectQuality} puntos por calidad del proyecto.`
      );
      visibleParts.push(`Criterios visibles de calidad: ${EVALUATION_CRITERIA.join(', ')}.`);

      if (project.leader?.alias || project.leader?.full_name) {
        visibleParts.push(
          `Líder visible: ${project.leader?.alias || project.leader?.full_name}.`
        );
      }

      if (project.leader?.email) {
        visibleParts.push(`Correo visible del líder: ${project.leader.email}.`);
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
      visibleParts.push(`Participante visible en esta pantalla: ${participant.full_name || participant.alias}.`);
    } else if (!loading) {
      visibleParts.push('No aparece un participante registrado en esta pantalla.');
    }

    visibleParts.push(`Cantidad de mensajes visibles en el foro: ${forumCount}.`);

    if (lastPost) {
      visibleParts.push(`Último comentario visible: ${lastPost.content}.`);
      visibleParts.push(`Autor visible del último comentario: ${lastPost.participant?.alias || 'Anónimo'}.`);
    }

    if (newPost.trim()) {
      visibleParts.push(`Texto escrito en el foro: ${newPost.trim()}.`);
    }

    if (supportLoading) {
      visibleParts.push('Se está procesando el apoyo al proyecto.');
    }

    if (sendingPost) {
      visibleParts.push('Se está publicando un comentario en el foro.');
    }

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
              label: '¿Qué proyecto estoy viendo?',
              question: '¿Qué proyecto está abierto ahora en esta pantalla?',
            },
            {
              id: 'pc-detalle-2',
              label: '¿Cuántos apoyos tiene?',
              question: '¿Cuántos apoyos visibles tiene este proyecto?',
            },
            {
              id: 'pc-detalle-3',
              label: '¿Cuántos apoyos faltan?',
              question: '¿Cuántos apoyos le faltan a este proyecto para entrar a evaluación final?',
            },
            {
              id: 'pc-detalle-4',
              label: '¿Ya es elegible?',
              question: '¿Este proyecto ya es elegible para evaluación final?',
            },
            {
              id: 'pc-detalle-5',
              label: '¿Qué categoría presupuestal tiene?',
              question: '¿Qué categoría presupuestal y qué monto solicitado tiene este proyecto?',
            },
          ];

    const summary = loading
      ? 'Pantalla de detalle de proyecto ciudadano cargando información del proyecto, apoyos y foro.'
      : error || !project
      ? 'Pantalla de detalle de proyecto ciudadano con error visible o proyecto no encontrado.'
      : 'Pantalla de detalle de proyecto ciudadano con información del proyecto, apoyos visibles, elegibilidad para evaluación final y foro visibles.';

    setPageContext({
      pageId: 'proyecto-ciudadano-proyecto-detalle',
      pageTitle: project?.name || 'Detalle de proyecto ciudadano',
      route: projectId ? `/proyecto-ciudadano/proyectos/${projectId}` : '/proyecto-ciudadano/proyectos/[id]',
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Proyecto Ciudadano', 'Proyectos', project?.name || 'Detalle'],
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
      selectedItemTitle: project?.name || undefined,
      status: loading ? 'loading' : error ? 'error' : 'ready',
      resultsSummary: `Foro visible con ${forumCount} comentario${forumCount === 1 ? '' : 's'}.`,
      suggestedPrompts,
      dynamicData: {
        projectId: project?.id || projectId || null,
        projectVisible: !!project,
        projectName: project?.name || null,
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
        leaderFullName: project?.leader?.full_name || null,
        leaderEmail: project?.leader?.email || null,
        pdfVisible,
        participantVisible: !!participant,
        participantName: participant?.full_name || participant?.alias || null,
        activeCycleVisible: !!activeCycle,
        supporting,
        supportBlockVisible,
        supportLoading,
        forumCount,
        lastForumPost: lastPost
          ? {
              content: lastPost.content,
              alias: lastPost.participant?.alias || 'Anónimo',
              created_at: lastPost.created_at,
            }
          : null,
        newPostDraft: newPost.trim() || null,
        sendingPost,
        canSupport,
        canComment,
        error: error || null,
      },
      contextVersion: 'pc-proyecto-detalle-v2',
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
          <Link href="/proyecto-ciudadano/proyectos" className="text-green-700 hover:underline">
            ← Volver a proyectos
          </Link>
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
  const requestedBudgetLabel =
    project.requested_budget != null
      ? `S/${Number(project.requested_budget).toLocaleString('es-PE', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}`
      : 'No especificado';

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <Link href="/proyecto-ciudadano/proyectos" className="text-sm text-slate-600 hover:underline">
            ← Volver a proyectos
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
              {project.category}
            </span>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
              {project.department} - {project.district}
            </span>
            <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {beneficiaryCount} apoyos
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

          <div className={`mb-4 rounded-xl p-4 border ${
            eligibleForFinalReview
              ? 'bg-green-50 border-green-300'
              : 'bg-amber-50 border-amber-300'
          }`}>
            <p className={`text-sm font-semibold ${
              eligibleForFinalReview ? 'text-green-800' : 'text-amber-800'
            }`}>
              {eligibleForFinalReview
                ? '✅ Este proyecto ya es elegible para evaluación final.'
                : `⏳ A este proyecto le faltan ${supportsRemaining} apoyos para entrar a evaluación final.`}
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
            <p className="text-slate-800">{project.leader?.alias || project.leader?.full_name || 'Anónimo'}</p>
            {project.leader?.email && (
              <p className="text-sm text-slate-500">{project.leader.email}</p>
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
                📄 Descargar documento del proyecto (PDF)
              </a>
            </div>
          )}

          <div className="mt-4 text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-300">
            <strong>📊 Evaluación del proyecto:</strong> Para entrar a evaluación final, este proyecto necesita al menos <strong>{minSupportsRequired} apoyos válidos</strong>.
            La nota final combina <strong>{EVALUATION_WEIGHTS.citizenSupport} puntos por respaldo ciudadano</strong> y <strong>{EVALUATION_WEIGHTS.projectQuality} puntos por calidad del proyecto</strong>.
            La calidad se evalúa por impacto comunitario, claridad del problema y la solución, viabilidad técnica y presupuestal, y sostenibilidad del beneficio.
          </div>

          {project.status === 'active' && (
            <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
              <strong>🏆 Bases del premio:</strong> Los premios consisten en un <strong>fondo concursable</strong> para la ejecución del proyecto.
              El monto se entrega en <strong>materiales, herramientas e insumos</strong>, pagados directamente a proveedores.
              No se entrega dinero en efectivo al ganador. El proyecto debe ajustarse al monto otorgado.
            </div>
          )}

          {project.status === 'active' && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <button
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

              {!participant && (
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Para apoyar, primero debes{' '}
                  <Link href="/proyecto-ciudadano/registro" className="text-green-700 underline">
                    registrarte
                  </Link>.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Foro de discusión</h2>
          <p className="text-sm text-slate-600 mb-4">
            Participa con ideas y preguntas sobre este proyecto.
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
                  <p className="text-sm text-slate-800">{post.content}</p>
                </div>
              ))
            )}
          </div>

          {participant ? (
            <div className="flex gap-2">
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="Escribe tu comentario o pregunta..."
                rows={2}
                className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={handlePost}
                disabled={sendingPost || !newPost.trim()}
                className="bg-green-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
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
        </div>
      </div>
    </main>
  );
}