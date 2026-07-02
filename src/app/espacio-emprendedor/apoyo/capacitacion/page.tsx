'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

type Professional = {
  id: string;
  codigo_profesional: string;
  public_name: string;
  professional_type: string;
  specialties: string[];
  services: string[];
  department: string | null;
  province: string | null;
  district: string | null;
  attention_mode: string | null;
  service_mode: string | null;
  service_mode_note: string | null;
  educational_activities: string[];
  training_categories: string[];
  experience_summary: string | null;
  public_message: string | null;
  document_url: string | null;
  created_at: string;
  is_mine: boolean;
};

type TrainingProfessional = {
  id: string;
  codigo_profesional: string | null;
  public_name: string | null;
  professional_type: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  attention_mode: string | null;
  service_mode: string | null;
  service_mode_note: string | null;
};

type TrainingItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  resource_type: string;
  resource_url: string;
  is_free: boolean;
  created_at: string;
  professional: TrainingProfessional | null;
};

const TRAINING_AREAS = [
  {
    icon: '📣',
    title: 'Marketing',
    description:
      'Clientes, posicionamiento, comunicación, redes sociales y estrategias para vender mejor.',
  },
  {
    icon: '💰',
    title: 'Finanzas',
    description:
      'Flujo de caja, presupuestos, inversión, ahorro, costos y decisiones financieras básicas.',
  },
  {
    icon: '📊',
    title: 'Contabilidad',
    description:
      'Orden contable, registros, costos, estados básicos y control económico del emprendimiento.',
  },
  {
    icon: '🧾',
    title: 'Tributación',
    description:
      'Obligaciones tributarias, comprobantes, regímenes y cuidados básicos frente a SUNAT.',
  },
  {
    icon: '⚖️',
    title: 'Legal',
    description:
      'Contratos, formalización, responsabilidades, acuerdos, derechos y obligaciones del emprendedor.',
  },
  {
    icon: '🛒',
    title: 'Ventas',
    description:
      'Técnicas de venta, atención al cliente, negociación y mejora del proceso comercial.',
  },
  {
    icon: '🤖',
    title: 'Inteligencia Artificial',
    description:
      'Uso práctico de herramientas digitales e inteligencia artificial para mejorar procesos.',
  },
  {
    icon: '🌐',
    title: 'Comercio electrónico',
    description:
      'Ventas por internet, tiendas digitales, medios de pago y canales de atención en línea.',
  },
  {
    icon: '🧩',
    title: 'Formulación de proyectos',
    description:
      'Cómo convertir una idea en un proyecto claro, presentable, ordenado y evaluable.',
  },
  {
    icon: '🧭',
    title: 'Liderazgo',
    description:
      'Organización, toma de decisiones, trabajo en equipo y dirección del emprendimiento.',
  },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';

  return new Date(dateStr).toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function getLocationLabel(professional: TrainingProfessional | null) {
  if (!professional) return '';

  return [professional.district, professional.province, professional.department]
    .filter(Boolean)
    .join(' · ');
}

export default function CapacitacionPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [selectedArea, setSelectedArea] = useState(TRAINING_AREAS[0].title);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const selectedAreaData = useMemo(
    () =>
      TRAINING_AREAS.find((area) => area.title === selectedArea) ||
      TRAINING_AREAS[0],
    [selectedArea]
  );

  const professionalsForArea = useMemo(() => {
    const currentArea = normalizeText(selectedArea);

    return professionals.filter((professional) =>
      (professional.training_categories || []).some(
        (category) => normalizeText(category) === currentArea
      )
    );
  }, [professionals, selectedArea]);

  const trainingsForArea = useMemo(() => {
    const currentArea = normalizeText(selectedArea);

    return trainings.filter(
      (training) => normalizeText(training.category || '') === currentArea
    );
  }, [trainings, selectedArea]);

  useEffect(() => {
    const visibleParts = [
      'Pantalla visible: Centro de Capacitación Gratuita para emprendedores.',
      'Esta pantalla organiza categorías de capacitación como marketing, finanzas, contabilidad, tributación, legal, ventas, inteligencia artificial, comercio electrónico, formulación de proyectos y liderazgo.',
      `Categoría seleccionada: ${selectedArea}.`,
      trainingsForArea.length
        ? `Capacitaciones publicadas en esta categoría: ${trainingsForArea.length}.`
        : 'Todavía no hay capacitaciones publicadas en esta categoría.',
      professionalsForArea.length
        ? `Profesionales vinculados a esta categoría: ${professionalsForArea.length}.`
        : 'Todavía no hay profesionales vinculados a esta categoría.',
      'Los contenidos tienen carácter educativo e informativo y no sustituyen asesoría profesional personalizada.',
    ];

    setPageContext({
      pageId: 'espacio-emprendedor-apoyo-capacitacion',
      pageTitle: 'Centro de Capacitación Gratuita',
      route: '/espacio-emprendedor/apoyo/capacitacion',
      summary:
        'Centro de Capacitación Gratuita con categorías educativas para emprendedores, capacitaciones publicadas y profesionales registrados vinculados por área.',
      speakableSummary:
        'Estás en el Centro de Capacitación Gratuita. Puedes elegir una categoría como marketing, finanzas, contabilidad, tributación, legal, ventas, inteligencia artificial, comercio electrónico, formulación de proyectos o liderazgo. Aquí se muestran cursos, talleres, videos, guías o materiales publicados por profesionales registrados. Los contenidos son educativos y no reemplazan asesoría profesional personalizada.',
      activeSection: 'capacitacion-gratuita',
      activeViewId: 'training-center-home',
      activeViewTitle: 'Centro de Capacitación Gratuita',
      breadcrumb: [
        'Espacio Emprendedor',
        'Centro de Apoyo',
        'Capacitación gratuita',
      ],
      visibleSections: [
        'presentacion',
        'categorias-capacitacion',
        'capacitaciones-publicadas',
        'profesionales-vinculados',
        'aviso-responsabilidad',
      ],
      visibleActions: [
        'Volver al Centro de Apoyo',
        'Seleccionar categoría de capacitación',
        'Ver recurso gratuito',
        'Ver profesionales vinculados',
        'Ir al registro profesional',
        'Buscar profesionales asesores',
      ],
      availableActions: [
        'Volver al Centro de Apoyo',
        'Seleccionar categoría de capacitación',
        'Ver recurso gratuito',
        'Ver profesionales vinculados',
        'Ir al registro profesional',
        'Buscar profesionales asesores',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: selectedArea,
      status: loading ? 'loading' : notice ? 'error' : 'ready',
      suggestedPrompts: [
        {
          id: 'ee-cap-1',
          label: '¿Qué hay aquí?',
          question: '¿Qué puedo encontrar en el Centro de Capacitación Gratuita?',
        },
        {
          id: 'ee-cap-2',
          label: 'Categorías',
          question: '¿Qué categorías de capacitación hay disponibles?',
        },
        {
          id: 'ee-cap-3',
          label: 'Cursos publicados',
          question: '¿Qué cursos o materiales hay publicados en esta categoría?',
        },
        {
          id: 'ee-cap-4',
          label: 'Profesionales',
          question: '¿Qué profesionales están vinculados a esta categoría?',
        },
        {
          id: 'ee-cap-5',
          label: 'Publicar curso',
          question:
            '¿Cómo puede un profesional publicar cursos o materiales gratuitos?',
        },
        {
          id: 'ee-cap-6',
          label: 'Responsabilidad',
          question:
            '¿Estos cursos reemplazan una asesoría profesional personalizada?',
        },
      ],
      dynamicData: {
        trainingCenterVisible: true,
        selectedTrainingArea: selectedArea,
        trainingAreasCount: TRAINING_AREAS.length,
        professionalsCount: professionals.length,
        professionalsForSelectedAreaCount: professionalsForArea.length,
        trainingsCount: trainings.length,
        trainingsForSelectedAreaCount: trainingsForArea.length,
        canReturnToSupportCenter: true,
        canOpenProfessionalDirectory: true,
        canOpenProfessionalRegistration: true,
        disclaimer:
          'Los contenidos publicados tienen carácter educativo e informativo. No constituyen asesoría profesional personalizada.',
      },
      contextVersion: 'ee-capacitacion-v2-capacitaciones-publicadas',
    });

    return () => {
      clearPageContext();
    };
  }, [
    selectedArea,
    professionals.length,
    professionalsForArea.length,
    trainings.length,
    trainingsForArea.length,
    loading,
    notice,
    setPageContext,
    clearPageContext,
  ]);

  useEffect(() => {
    async function loadTrainingCenterData() {
      try {
        setLoading(true);
        setNotice('');

        const deviceId =
          typeof window !== 'undefined'
            ? localStorage.getItem('vc_device_id') || ''
            : '';

        const professionalParams = new URLSearchParams();

        if (deviceId) {
          professionalParams.set('device_id', deviceId);
        }

        const [professionalsRes, trainingsRes] = await Promise.all([
          fetch(
            `/api/espacio-emprendedor/profesionales/list${
              professionalParams.toString()
                ? `?${professionalParams.toString()}`
                : ''
            }`,
            {
              cache: 'no-store',
            }
          ),
          fetch('/api/espacio-emprendedor/capacitaciones/list', {
            cache: 'no-store',
          }),
        ]);

        const professionalsData = await professionalsRes.json();
        const trainingsData = await trainingsRes.json();

        if (!professionalsRes.ok) {
          throw new Error(
            professionalsData?.error || 'No se pudo cargar la lista de profesionales.'
          );
        }

        if (!trainingsRes.ok) {
          throw new Error(
            trainingsData?.error || 'No se pudo cargar la lista de capacitaciones.'
          );
        }

        setProfessionals(professionalsData?.professionals || []);
        setTrainings(trainingsData?.capacitaciones || []);
      } catch (error: any) {
        console.error('Error cargando centro de capacitación:', error);
        setNotice(
          error?.message ||
            'No se pudo cargar la información de capacitación. Intenta nuevamente.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadTrainingCenterData();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Centro de Capacitación Gratuita
          </h1>

          <button
            type="button"
            onClick={() => router.push('/espacio-emprendedor/apoyo')}
            className="bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition vc-btn-wave vc-btn-pulse"
          >
            ← Volver
          </button>
        </div>

        <section className="bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm vc-fade-up">
          <p className="text-slate-700 text-lg font-semibold">
            🎓 Aprende con materiales gratuitos compartidos por profesionales registrados.
          </p>

          <p className="text-sm text-slate-600 mt-3">
            Este espacio organiza cursos, talleres, videos, guías y materiales
            educativos por categorías. Ahora puedes ver recursos publicados por
            profesionales registrados y abrir el enlace gratuito en una nueva pestaña.
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="font-bold text-blue-900">1. Elige un área</p>
              <p className="text-blue-800 text-xs mt-1">
                Selecciona la categoría que quieres aprender.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="font-bold text-emerald-900">
                2. Abre recursos gratuitos
              </p>
              <p className="text-emerald-800 text-xs mt-1">
                Revisa cursos, videos, talleres, guías o materiales publicados.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="font-bold text-amber-900">3. Evalúa con cuidado</p>
              <p className="text-amber-800 text-xs mt-1">
                La información es educativa y no reemplaza asesoría personalizada.
              </p>
            </div>
          </div>
        </section>

        {notice && (
          <div className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            {notice}
          </div>
        )}

        <section className="mt-6">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            Categorías de capacitación
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {TRAINING_AREAS.map((area) => {
              const isActive = area.title === selectedArea;
              const areaKey = normalizeText(area.title);
              const resourcesCount = trainings.filter(
                (training) => normalizeText(training.category || '') === areaKey
              ).length;

              return (
                <button
                  key={area.title}
                  type="button"
                  onClick={() => setSelectedArea(area.title)}
                  className={`text-left rounded-2xl border-2 p-4 shadow-sm transition vc-card-hover ${
                    isActive
                      ? 'bg-blue-700 border-blue-700 text-white'
                      : 'bg-white border-slate-200 text-slate-900 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-3xl mb-2">{area.icon}</div>

                    {resourcesCount > 0 && (
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                          isActive
                            ? 'bg-white text-blue-700'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {resourcesCount}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold">{area.title}</h3>

                  <p
                    className={`text-xs mt-2 ${
                      isActive ? 'text-blue-50' : 'text-slate-600'
                    }`}
                  >
                    {area.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 bg-white rounded-2xl border-2 border-slate-300 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Categoría seleccionada
              </p>

              <h2 className="text-2xl font-bold text-slate-900">
                {selectedAreaData.icon} {selectedAreaData.title}
              </h2>

              <p className="text-sm text-slate-600 mt-2">
                {selectedAreaData.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push('/espacio-emprendedor/apoyo/profesionales/registro')
              }
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 transition vc-btn-wave vc-btn-pulse"
            >
              Publicar como profesional →
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900 mb-3">
              Recursos gratuitos publicados
            </h3>

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Cargando capacitaciones publicadas...
              </div>
            ) : trainingsForArea.length === 0 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Todavía no hay cursos, talleres, videos o materiales publicados
                en esta categoría. Cuando un profesional publique un recurso
                gratuito, aparecerá aquí.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trainingsForArea.map((training) => {
                  const locationLabel = getLocationLabel(training.professional);

                  return (
                    <article
                      key={training.id}
                      className="rounded-2xl border border-blue-200 bg-blue-50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="rounded-full bg-blue-700 px-3 py-1 text-xs font-bold text-white">
                          {training.resource_type}
                        </span>

                        {training.is_free && (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                            Gratuito
                          </span>
                        )}

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                          {formatDate(training.created_at)}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900">
                        {training.title}
                      </h3>

                      {training.description && (
                        <p className="mt-2 text-sm text-slate-700">
                          {training.description}
                        </p>
                      )}

                      <div className="mt-3 rounded-xl border border-white bg-white/80 p-3 text-xs text-slate-700">
                        <p className="font-bold text-slate-900">
                          Publicado por:{' '}
                          {training.professional?.public_name ||
                            'Profesional registrado'}
                        </p>

                        {training.professional?.professional_type && (
                          <p className="mt-1">
                            {training.professional.professional_type}
                          </p>
                        )}

                        {training.professional?.codigo_profesional && (
                          <p className="mt-1 text-slate-500">
                            Código profesional:{' '}
                            {training.professional.codigo_profesional}
                          </p>
                        )}

                        {locationLabel && (
                          <p className="mt-1 text-slate-500">
                            Ubicación: {locationLabel}
                          </p>
                        )}
                      </div>

                      <a
                        href={training.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition"
                      >
                        Ver recurso gratuito →
                      </a>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-5">
            <h3 className="text-lg font-bold text-slate-900 mb-3">
              Profesionales vinculados a esta categoría
            </h3>

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Cargando profesionales vinculados a capacitación...
              </div>
            ) : professionalsForArea.length === 0 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Todavía no hay profesionales registrados en esta categoría de
                capacitación. Cuando un profesional marque esta categoría en su
                ficha, aparecerá aquí.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {professionalsForArea.map((professional) => (
                  <article
                    key={professional.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900">
                          {professional.public_name}
                        </h3>

                        <p className="text-xs text-slate-500 mt-1">
                          Código profesional: {professional.codigo_profesional}
                        </p>
                      </div>

                      {professional.is_mine && (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                          Mi ficha
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-slate-700 mt-3">
                      {professional.professional_type}
                    </p>

                    {professional.specialties?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {professional.specialties.slice(0, 4).map((specialty) => (
                          <span
                            key={specialty}
                            className="rounded-full bg-white border border-slate-300 px-3 py-1 text-xs text-slate-700"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    )}

                    {professional.educational_activities?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-bold text-blue-800">
                          Actividades educativas declaradas:
                        </p>

                        <p className="text-xs text-slate-600 mt-1">
                          {professional.educational_activities.join(', ')}
                        </p>
                      </div>
                    )}

                    {professional.public_message && (
                      <p className="text-sm text-slate-600 mt-3">
                        {professional.public_message}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        router.push('/espacio-emprendedor/apoyo/profesionales')
                      }
                      className="mt-4 w-full rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition"
                    >
                      Ver en directorio de profesionales →
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-900">
          <strong>⚠️ Aviso importante:</strong> Los contenidos publicados o
          compartidos en este espacio tienen carácter educativo e informativo.
          No constituyen asesoría profesional personalizada ni sustituyen una
          evaluación legal, financiera, contable, tributaria, comercial o técnica
          especializada. Voto Claro no garantiza resultados, rentabilidad,
          contratación, certificaciones ni validez de información externa.
        </section>
      </div>
    </main>
  );
}
