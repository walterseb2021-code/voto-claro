'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

// Función para obtener o crear device_id
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  return newId;
}

const MIN_SUPPORTS_REQUIRED = 100;
const BUDGET_CATEGORIES = [
  { id: 'hasta_10000', label: 'Hasta S/10,000' },
  { id: 'hasta_20000', label: 'Hasta S/20,000' },
  { id: 'hasta_30000', label: 'Hasta S/30,000' },
];

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

const OFFICIAL_TEMPLATE_DOCX = '/docs/proyecto-ciudadano/formato_oficial_proyecto_ciudadano.docx';
const OFFICIAL_TEMPLATE_PDF = '/docs/proyecto-ciudadano/formato_oficial_proyecto_ciudadano.pdf';

export default function ProyectoCiudadanoPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [participant, setParticipant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [codigoAcceso, setCodigoAcceso] = useState('');
  const [loginCodigoLoading, setLoginCodigoLoading] = useState(false);
  const [loginCodigoError, setLoginCodigoError] = useState('');
  const [winners, setWinners] = useState<any[]>([]);
  const [winnersLoading, setWinnersLoading] = useState(true);

  useEffect(() => {
    getOrCreateDeviceId();
    loadParticipant();
    loadWinners();
  }, []);

  // Función para cargar el participante por device_id
  const loadParticipant = async () => {
    const currentDeviceId = getOrCreateDeviceId();

    if (!currentDeviceId) {
      setParticipant(null);
      setLoading(false);
      return;
    }

    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('project_participants')
        .select('*')
        .eq('device_id', currentDeviceId)
        .maybeSingle();

      if (error) throw error;
      setParticipant(data || null);
    } catch (err) {
      console.error('Error cargando participante:', err);
      setParticipant(null);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  };

  // Cargar ganadores del ciclo anterior
  const loadWinners = async () => {
    setWinnersLoading(true);
    try {
      const { data: previousCycle } = await supabase
        .from('project_cycles')
        .select('id')
        .eq('is_active', false)
        .order('ends_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!previousCycle) {
        setWinners([]);
        return;
      }

      const { data } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          category,
          district,
          department,
          beneficiary_count,
          leader:project_participants!leader_id (
            alias
          )
        `)
        .eq('cycle_id', previousCycle.id)
        .eq('status', 'active')
        .order('beneficiary_count', { ascending: false })
        .limit(3);

      const transformed = (data || []).map((item: any) => ({
        ...item,
        leader: item.leader && item.leader.length > 0 ? item.leader[0] : null,
      }));

      setWinners(transformed);
    } catch (err) {
      console.error('Error cargando ganadores:', err);
      setWinners([]);
    } finally {
      setWinnersLoading(false);
    }
  };

  // Función para iniciar sesión con código de acceso
  const handleLoginConCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginCodigoLoading(true);
    setLoginCodigoError('');

    const codigo = codigoAcceso.trim().toUpperCase();
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

      const currentDeviceId = getOrCreateDeviceId();
      const { error: updateError } = await supabase
        .from('project_participants')
        .update({ device_id: currentDeviceId })
        .eq('id', data.id);

      if (updateError) throw updateError;

      await loadParticipant();
      setCodigoAcceso('');
    } catch (err: any) {
      console.error('Error al iniciar sesión con código:', err);
      setLoginCodigoError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoginCodigoLoading(false);
    }
  };

  // Forzar recarga manual
  const handleRefresh = () => {
    setLoading(true);
    loadParticipant();
  };

  // Estilos con animaciones
  const card = "rounded-2xl border-2 border-red-600 p-6 shadow-sm vc-fade-up vc-card-hover";
  const btnPrimary = "bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition vc-btn-wave vc-btn-pulse";
  const btnSecondary = "bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition vc-btn-wave vc-btn-pulse";
  const btnBlue = "bg-blue-700 text-white py-2 rounded-xl font-semibold hover:bg-blue-800 transition disabled:opacity-50 vc-btn-wave vc-btn-pulse";
  const inputStyle = "w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none font-mono";

  useEffect(() => {
    const participantReady = !!participant;
    const participantName = participant?.full_name || '';
    const participantAlias = participant?.alias || '';
    const participantCode = participant?.codigo_acceso || '';

    const activeSection =
      loading || checking
        ? 'principal-cargando'
        : !participant
        ? 'principal-sin-registro'
        : 'principal-participante-activo';

    const activeViewId =
      loading || checking
        ? 'loading'
        : !participant
        ? 'guest-home'
        : 'participant-home';

    const activeViewTitle =
      loading || checking
        ? 'Cargando Proyecto Ciudadano'
        : !participant
        ? 'Acceso y registro a Proyecto Ciudadano'
        : 'Panel principal del participante';

    const winnersVisible = winners.slice(0, 3);
    const winnersTitles = winnersVisible.map((winner) => winner?.name).filter(Boolean);
    const hasWinners = winnersVisible.length > 0;
    const hasLoginCodeText = codigoAcceso.trim().length > 0;

    const visibleParts: string[] = [];

    if (loading || checking) {
      visibleParts.push('La pantalla principal de Proyecto Ciudadano está cargando.');
    }

    if (!participantReady && !(loading || checking)) {
      visibleParts.push('El usuario todavía no aparece como participante registrado en esta pantalla.');
      visibleParts.push('Se ve una acción para registrarse y otra para iniciar sesión con código.');
    }

    if (participantReady) {
      visibleParts.push(`Participante visible: ${participantName}.`);
      if (participantAlias) {
        visibleParts.push(`Alias visible: ${participantAlias}.`);
      }
      if (participantCode) {
        visibleParts.push(`Código de acceso visible: ${participantCode}.`);
      }
      visibleParts.push('Se ven acciones para presentar proyecto y para ver proyectos activos.');
    }

    if (hasLoginCodeText) {
      visibleParts.push(`Texto visible en el campo de código: ${codigoAcceso.trim().toUpperCase()}.`);
    } else if (!participantReady && !(loading || checking)) {
      visibleParts.push('No hay código escrito en el campo de acceso rápido.');
    }

    if (loginCodigoError) {
      visibleParts.push(`Error visible en inicio de sesión con código: ${loginCodigoError}.`);
    }

    if (loginCodigoLoading) {
      visibleParts.push('Se está verificando un código de acceso.');
    }

    if (winnersLoading) {
      visibleParts.push('El bloque de ganadores del ciclo anterior está cargando.');
    } else if (!hasWinners) {
      visibleParts.push('No hay ganadores del ciclo anterior visibles en pantalla.');
    } else {
      visibleParts.push(`Ganadores visibles del ciclo anterior: ${winnersTitles.join(', ')}.`);
    }

    visibleParts.push(`Regla visible del programa: se requieren al menos ${MIN_SUPPORTS_REQUIRED} apoyos vecinales válidos para entrar a evaluación final.`);
    visibleParts.push(`Categorías presupuestales visibles: ${BUDGET_CATEGORIES.map((item) => item.label).join(', ')}.`);
    visibleParts.push(`Ponderación visible de evaluación: ${EVALUATION_WEIGHTS.citizenSupport} puntos por respaldo ciudadano y ${EVALUATION_WEIGHTS.projectQuality} puntos por calidad del proyecto.`);
    visibleParts.push(`Criterios visibles de calidad del proyecto: ${EVALUATION_CRITERIA.join(', ')}.`);
    visibleParts.push('Hay acceso visible para descargar el formato oficial del proyecto en DOCX y ver el modelo en PDF.');

    const availableActions = [
      'Recargar',
      'Volver al inicio',
      !participantReady ? 'Registrarme ahora' : null,
      !participantReady ? 'Iniciar sesión con código' : null,
      participantReady ? 'Presentar proyecto' : null,
      'Ver proyectos activos',
      'Descargar formato oficial en DOCX',
      'Ver formato modelo en PDF',
      hasWinners ? 'Ver proyecto ganador' : null,
    ].filter(Boolean) as string[];

    const summary =
      loading || checking
        ? 'Pantalla principal de Proyecto Ciudadano cargando estado del participante y contenido visible.'
        : !participantReady
        ? 'Pantalla principal de Proyecto Ciudadano con acceso para registrarse o iniciar sesión con código, reglas de participación visibles y formato oficial descargable.'
        : 'Pantalla principal de Proyecto Ciudadano con participante identificado, reglas de evaluación visibles, formato oficial descargable y acciones para presentar proyectos o ver proyectos activos.';

    const suggestedPrompts = !participantReady
      ? [
          {
            id: 'pc-home-1',
            label: '¿Qué puedo hacer aquí?',
            question: '¿Qué puedo hacer en esta pantalla de Proyecto Ciudadano?',
          },
          {
            id: 'pc-home-2',
            label: '¿Necesito registrarme?',
            question: '¿Necesito registrarme para participar en Proyecto Ciudadano?',
          },
          {
            id: 'pc-home-3',
            label: '¿Cuántos apoyos mínimos se necesitan?',
            question: '¿Cuántos apoyos mínimos necesita un proyecto para entrar a evaluación final?',
          },
          {
            id: 'pc-home-4',
            label: '¿Cómo se evalúa?',
            question: '¿Cómo se evalúan los proyectos en Proyecto Ciudadano?',
          },
          {
            id: 'pc-home-5',
            label: '¿Dónde descargo el formato?',
            question: '¿Dónde puedo descargar el formato oficial del proyecto desde esta pantalla?',
          },
        ]
      : [
          {
            id: 'pc-home-1',
            label: '¿Qué puedo hacer aquí?',
            question: '¿Qué puedo hacer ahora en esta pantalla de Proyecto Ciudadano?',
          },
          {
            id: 'pc-home-2',
            label: '¿Ya aparezco registrado?',
            question: '¿Ya aparezco como participante registrado en esta pantalla?',
          },
          {
            id: 'pc-home-3',
            label: '¿Dónde presento un proyecto?',
            question: '¿Dónde presento un nuevo proyecto desde esta pantalla?',
          },
          {
            id: 'pc-home-4',
            label: '¿Cómo se evalúan los proyectos?',
            question: '¿Cómo se evalúan los proyectos en Proyecto Ciudadano?',
          },
          {
            id: 'pc-home-5',
            label: '¿Dónde descargo el formato?',
            question: '¿Dónde puedo descargar el formato oficial del proyecto desde esta pantalla?',
          },
        ];

    setPageContext({
      pageId: 'proyecto-ciudadano',
      pageTitle: 'Proyecto Ciudadano',
      route: '/proyecto-ciudadano',
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Proyecto Ciudadano', activeViewTitle],
      visibleSections: [
        'cabecera',
        'bienvenida',
        'reglas-de-participacion-y-evaluacion',
        'formato-oficial-del-proyecto',
        'ganadores-ciclo-anterior',
        participantReady ? 'panel-participante' : 'registro-o-acceso',
        'proyectos-destacados',
      ],
      visibleActions: availableActions,
      availableActions,
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: winnersTitles[0] || participantName || undefined,
      status: loading || checking ? 'loading' : loginCodigoError ? 'error' : 'ready',
      resultsSummary: hasWinners
        ? `Se muestran ${winnersVisible.length} ganadores del ciclo anterior.`
        : 'No hay ganadores visibles del ciclo anterior.',
      suggestedPrompts,
      dynamicData: {
        participantVisible: participantReady,
        participantName: participantName || null,
        participantAlias: participantAlias || null,
        participantCodeVisible: !!participantCode,
        loginCodeTyped: hasLoginCodeText,
        loginCodigoLoading,
        loginCodigoError: loginCodigoError || null,
        winnersLoading,
        winnersCount: winners.length,
        visibleWinnerTitles: winnersTitles,
        canRegister: !participantReady,
        canLoginWithCode: !participantReady,
        canCreateProject: participantReady,
        canViewProjects: true,
        officialTemplateAvailable: true,
        officialTemplateDocxUrl: OFFICIAL_TEMPLATE_DOCX,
        officialTemplatePdfUrl: OFFICIAL_TEMPLATE_PDF,
        minimumSupportsRequired: MIN_SUPPORTS_REQUIRED,
        budgetCategories: BUDGET_CATEGORIES,
        evaluationWeights: EVALUATION_WEIGHTS,
        evaluationCriteria: EVALUATION_CRITERIA,
        competitionFrequency: 'trimestral',
        winnersPerCycle: 3,
        winnerRule: 'un ganador por cada categoría presupuestal',
      },
      contextVersion: 'pc-home-v2',
    });
  }, [
    setPageContext,
    participant,
    loading,
    checking,
    codigoAcceso,
    loginCodigoLoading,
    loginCodigoError,
    winners,
    winnersLoading,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  if (loading || checking) {
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
          <h1 className="text-3xl font-bold text-slate-900">Proyecto Ciudadano</h1>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className={btnSecondary}
            >
              🔄 Recargar
            </button>
            <Link href="/" className={btnPrimary}>
              ← Volver al inicio
            </Link>
          </div>
        </div>

        {/* Mensaje de bienvenida */}
        <div className={`bg-white ${card}`}>
          <p className="text-slate-700 text-lg font-semibold">
            💡 Convierte tus ideas en acción. Presenta un proyecto para tu comunidad, forma un equipo y recibe apoyo vecinal.
            Cada 3 meses se elige un proyecto ganador por categoría presupuestal.
          </p>

          {/* Bases del premio */}
          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>🏆 Bases del premio:</strong> Los premios consisten en un <strong>fondo concursable</strong> para la ejecución del proyecto.
            El monto se entrega en <strong>materiales, herramientas e insumos</strong>, pagados directamente a proveedores.
            No se entrega dinero en efectivo al ganador. El proyecto debe ajustarse al monto otorgado (S/30,000 / S/20,000 / S/10,000).
            La mano de obra puede ser voluntaria (propia del comité) o estar presupuestada, en cuyo caso se paga directamente a los trabajadores.
          </div>
        </div>

        {/* Reglas de participación y evaluación */}
        <div className="bg-white rounded-2xl border-2 border-emerald-600 p-6 shadow-sm mb-6 vc-fade-up vc-delay-1">
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            📋 Reglas de participación y evaluación
          </h2>

          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Para entrar a evaluación final, un proyecto debe reunir <strong>al menos 100 apoyos vecinales válidos</strong>.
            </p>
            <p>
              Los proyectos compiten en <strong>tres categorías presupuestales</strong>: hasta S/10,000, hasta S/20,000 y hasta S/30,000.
            </p>
            <p>
              Cada 3 meses se elige <strong>un ganador por categoría</strong>.
            </p>
            <p>
              La nota final combina <strong>40 puntos por respaldo ciudadano</strong> y <strong>60 puntos por calidad del proyecto</strong>.
            </p>
            <p>
              La calidad del proyecto se evalúa considerando <strong>impacto comunitario</strong>, <strong>claridad del problema y la solución</strong>, <strong>viabilidad técnica y presupuestal</strong> y <strong>sostenibilidad del beneficio</strong>.
            </p>
          </div>
        </div>

        {/* Formato oficial */}
        <div className="bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-sm mb-6 vc-fade-up vc-delay-1">
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            📄 Formato oficial del proyecto
          </h2>
          <p className="text-slate-600 mb-4 text-sm">
            Descarga el formato oficial, complétalo con la información de tu proyecto y luego súbelo en PDF para su revisión.
            Este formato está diseñado para que todos los proyectos se presenten de manera clara, breve y comparable.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href={OFFICIAL_TEMPLATE_DOCX}
              download
              className="inline-block bg-indigo-700 text-white px-5 py-2 rounded-xl font-semibold hover:bg-indigo-800 transition vc-btn-wave vc-btn-pulse"
            >
              ⬇️ Descargar formato editable (.docx)
            </a>

            <a
              href={OFFICIAL_TEMPLATE_PDF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-slate-200 text-slate-800 px-5 py-2 rounded-xl font-semibold hover:bg-slate-300 transition vc-btn-wave vc-btn-pulse"
            >
              👁️ Ver formato modelo (.pdf)
            </a>
          </div>
        </div>

        {/* Bloque de ganadores del ciclo anterior */}
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl border-2 border-yellow-600 p-6 mb-6 shadow-sm vc-fade-up vc-delay-1">
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            🏆 Ganadores del ciclo anterior
          </h2>
          {winnersLoading ? (
            <p className="text-slate-600">Cargando ganadores...</p>
          ) : winners.length === 0 ? (
            <p className="text-slate-500">Próximamente se mostrarán los proyectos ganadores.</p>
          ) : (
            <div className="space-y-3">
              {winners.map((winner, index) => (
                <div key={winner.id} className="bg-white rounded-xl p-4 shadow-sm border border-yellow-200 vc-card-hover">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-yellow-600">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </span>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">{winner.name}</h3>
                      <p className="text-sm text-slate-600">{winner.category} • {winner.department} - {winner.district}</p>
                      <p className="text-xs text-slate-500 mt-1">Líder: {winner.leader?.alias || 'Anónimo'}</p>
                    </div>
                       <button
  type="button"
  onClick={() => router.push(`/proyecto-ciudadano/proyectos/${winner.id}`)}
  className="text-sm text-green-700 hover:underline cursor-pointer relative z-10"
>
  Ver proyecto →
</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado del usuario */}
        {!participant ? (
          <>
            <div className={`bg-white ${card} mb-4`}>
              <h2 className="text-xl font-bold text-slate-900 mb-3">Regístrate para participar</h2>
              <p className="text-slate-600 mb-4">
                Completa tu perfil para poder presentar proyectos o apoyar iniciativas ciudadanas.
              </p>
              <Link
                href="/proyecto-ciudadano/registro"
                className="inline-block bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 vc-btn-wave vc-btn-pulse"
              >
                Registrarme ahora
              </Link>
            </div>

            {/* Inicio de sesión con código */}
            <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm vc-fade-up vc-delay-2">
              <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="text-2xl">🔑</span> Iniciar sesión con código
              </h2>
              <p className="text-slate-600 mb-4 text-sm">
                Si ya tienes un código de acceso (el que te dieron al registrarte), ingrésalo aquí.
              </p>

              {loginCodigoError && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm vc-slide-in">
                  {loginCodigoError}
                </div>
              )}

              <form onSubmit={handleLoginConCodigo} className="space-y-3">
                <input
                  type="text"
                  placeholder="Ej: EMP-2026-3A7F"
                  value={codigoAcceso}
                  onChange={(e) => setCodigoAcceso(e.target.value.toUpperCase())}
                  className={inputStyle}
                  disabled={loginCodigoLoading}
                />
                <button
                  type="submit"
                  disabled={loginCodigoLoading}
                  className={"w-full " + btnBlue}
                >
                  {loginCodigoLoading ? 'Verificando...' : 'Iniciar sesión con código'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className={`bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm vc-fade-up`}>
            <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Bienvenido, {participant.full_name}</h2>
                <p className="text-sm text-slate-600">Alias: {participant.alias}</p>
                <p className="text-xs text-slate-500 mt-1">Registrado el {new Date(participant.created_at).toLocaleDateString()}</p>
                {participant.codigo_acceso && (
                  <p className="text-xs text-blue-600 mt-1 font-mono">Código: {participant.codigo_acceso}</p>
                )}
              </div>
              <button
                onClick={handleRefresh}
                className="text-sm text-green-700 hover:text-green-800 font-semibold vc-btn-wave"
              >
                ↻ Actualizar datos
              </button>
            </div>

            <p className="text-slate-600 mb-4">
              Puedes presentar un nuevo proyecto o apoyar iniciativas existentes.
            </p>

              <div className="flex flex-wrap gap-4 relative z-10">
  <button
    type="button"
    onClick={() => router.push('/proyecto-ciudadano/nuevo-proyecto')}
    className="bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800 inline-block vc-btn-wave vc-btn-pulse cursor-pointer"
  >
    📝 Presentar proyecto
  </button>

  <button
    type="button"
    onClick={() => router.push('/proyecto-ciudadano/proyectos')}
    className="bg-slate-200 text-slate-800 px-6 py-2 rounded-xl font-semibold hover:bg-slate-300 inline-block vc-btn-wave vc-btn-pulse cursor-pointer"
  >
    🔍 Ver proyectos activos
  </button>
</div>
          </div>
        )}

        {/* Lista de proyectos destacados */}
        <div className={`bg-white ${card} mt-6`}>
          <h2 className="text-xl font-bold text-slate-900 mb-3">Proyectos destacados</h2>
          <p className="text-slate-500">Próximamente se mostrarán los proyectos con más apoyo ciudadano.</p>
              <button
  type="button"
  onClick={() => router.push('/proyecto-ciudadano/proyectos')}
  className="inline-block mt-3 text-green-700 hover:text-green-800 font-semibold vc-btn-wave cursor-pointer relative z-10"
>
  Ver todos los proyectos →
</button>
        </div>
      </div>
    </main>
  );
}