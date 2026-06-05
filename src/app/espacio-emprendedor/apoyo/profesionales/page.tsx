'use client';

import { useEffect, useState } from 'react';
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
  experience_summary: string | null;
  public_message: string | null;
  document_url?: string | null;
  created_at: string;
  is_mine?: boolean;
  };

const PROFESSIONAL_AREAS = [
  {
    icon: '⚖️',
    title: 'Asesoría legal',
    description:
      'Apoyo para revisar contratos, acuerdos con inversionistas, sociedades, confidencialidad, responsabilidades y protección de derechos.',
    tasks: [
      'Revisar contratos antes de firmar.',
      'Orientar sobre acuerdos con socios o inversionistas.',
      'Advertir riesgos legales básicos.',
    ],
  },
  {
    icon: '📊',
    title: 'Asesoría contable y tributaria',
    description:
      'Orientación sobre costos, formalización, impuestos, comprobantes, libros contables, flujo de caja y obligaciones tributarias.',
    tasks: [
      'Ordenar ingresos y gastos.',
      'Revisar obligaciones tributarias.',
      'Preparar información financiera básica.',
    ],
  },
  {
    icon: '💰',
    title: 'Finanzas para emprendedores',
    description:
      'Apoyo para preparar presupuestos, proyecciones, punto de equilibrio, capacidad de endeudamiento y análisis de inversión.',
    tasks: [
      'Calcular inversión inicial referencial.',
      'Revisar márgenes y costos.',
      'Evaluar escenarios conservadores.',
    ],
  },
  {
    icon: '🧩',
    title: 'Formulación de proyectos',
    description:
      'Ayuda para convertir una idea en proyecto: problema, solución, objetivos, actividades, presupuesto, cronograma e indicadores.',
    tasks: [
      'Ordenar la idea del proyecto.',
      'Mejorar el resumen ejecutivo.',
      'Preparar el documento de presentación.',
    ],
  },
  {
    icon: '📣',
    title: 'Marketing y ventas',
    description:
      'Orientación para definir público objetivo, propuesta de valor, canales de venta, estrategia comercial y presentación del producto.',
    tasks: [
      'Identificar clientes potenciales.',
      'Mejorar la propuesta de valor.',
      'Preparar una estrategia inicial de ventas.',
    ],
  },
  {
    icon: '🛡️',
    title: 'Propiedad intelectual y marca',
    description:
      'Orientación sobre nombres comerciales, marcas, derechos de autor, secretos empresariales y protección de activos intangibles.',
    tasks: [
      'Revisar si conviene registrar marca.',
      'Cuidar información sensible del proyecto.',
      'Preparar acuerdos de confidencialidad.',
    ],
  },
];

const CHECKLIST = [
  '¿El profesional muestra experiencia verificable?',
  '¿Explica claramente qué servicio ofrece?',
  '¿Indica honorarios, condiciones y alcance del servicio?',
  '¿Evita prometer resultados garantizados?',
  '¿Acepta dejar constancia por escrito del servicio contratado?',
  '¿Respeta la confidencialidad de tu proyecto?',
  '¿Puedes comparar con otro profesional antes de decidir?',
  '¿Entiendes qué documentos o información le entregarás?',
];

function getLocationLabel(professional: Professional) {
  const parts = [
    professional.department,
    professional.province,
    professional.district,
  ].filter(Boolean);

  return parts.length ? parts.join(' - ') : 'Ubicación no especificada';
}

function shortText(value: string | null, max = 180) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

export default function ProfesionalesApoyoPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const goToPath = (path: string) => {
    window.location.href = path;
  };

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(true);
  const [professionalsError, setProfessionalsError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('Todos');

  useEffect(() => {
    async function loadProfessionals() {
      setLoadingProfessionals(true);
      setProfessionalsError(null);

      try {
          const deviceId =
  typeof window !== 'undefined'
    ? localStorage.getItem('vc_device_id') || ''
    : '';

const url = deviceId
  ? `/api/espacio-emprendedor/profesionales/list?device_id=${encodeURIComponent(deviceId)}`
  : '/api/espacio-emprendedor/profesionales/list';

const res = await fetch(url, {
  cache: 'no-store',
});

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || 'No se pudo cargar el directorio.');
        }

        setProfessionals(data.professionals || []);
      } catch (err: any) {
        console.error('Error cargando profesionales:', err);
        setProfessionalsError(
          err.message || 'No se pudo cargar el directorio de profesionales.'
        );
      } finally {
        setLoadingProfessionals(false);
      }
    }

    loadProfessionals();
  }, []);

  const professionalTypes = [
    'Todos',
    ...Array.from(
      new Set(
        professionals
          .map((item) => item.professional_type)
          .filter(Boolean)
      )
    ),
  ];

  const filteredProfessionals = professionals.filter((professional) => {
    const q = searchTerm.trim().toLowerCase();

    const matchesType =
      selectedType === 'Todos' || professional.professional_type === selectedType;

    const searchableText = [
      professional.public_name,
      professional.codigo_profesional,
      professional.professional_type,
      professional.department,
      professional.province,
      professional.district,
      professional.attention_mode,
      ...(professional.specialties || []),
      ...(professional.services || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesSearch = !q || searchableText.includes(q);

    return matchesType && matchesSearch;
  });

  useEffect(() => {
    const visibleProfessionalNames = filteredProfessionals
      .slice(0, 6)
      .map((item) => item.public_name)
      .filter(Boolean);

    const visibleProfessionalCodes = filteredProfessionals
      .slice(0, 6)
      .map((item) => item.codigo_profesional)
      .filter(Boolean);

    const hasSearch = searchTerm.trim().length > 0;
    const hasTypeFilter = selectedType !== 'Todos';

    const visibleParts = [
      'Pantalla visible: Profesionales asesores del Centro de Apoyo al Emprendedor.',
      'Esta pantalla muestra áreas profesionales que pueden ayudar a mejorar un proyecto emprendedor.',
      'Hay un acceso visible para que una persona pueda registrar o editar su ficha profesional.',
      'Para participar como profesional asesor, el usuario debe llenar su ficha profesional y obtener su código profesional único.',
      'El código profesional es identificador público, no clave de acceso.',
      'La pantalla incluye un directorio de profesionales registrados con información declarada por cada profesional.',
      `Cantidad total de profesionales cargados: ${professionals.length}.`,
      `Cantidad de profesionales visibles con filtros actuales: ${filteredProfessionals.length}.`,
      hasSearch
        ? `Búsqueda visible: ${searchTerm.trim()}.`
        : 'No hay búsqueda activa en el directorio.',
      hasTypeFilter
        ? `Filtro de tipo profesional seleccionado: ${selectedType}.`
        : 'No hay filtro específico de tipo profesional.',
      loadingProfessionals
        ? 'El directorio de profesionales está cargando.'
        : 'El directorio de profesionales ya terminó de cargar.',
      professionalsError
        ? `Error visible del directorio: ${professionalsError}.`
        : 'No hay error visible en el directorio.',
      visibleProfessionalNames.length
        ? `Profesionales visibles: ${visibleProfessionalNames.join(', ')}.`
        : 'No hay nombres de profesionales visibles con los filtros actuales.',
      visibleProfessionalCodes.length
        ? `Códigos profesionales visibles: ${visibleProfessionalCodes.join(', ')}.`
        : 'No hay códigos profesionales visibles con los filtros actuales.',
      'La información es orientativa y no constituye recomendación directa de contratación.',
      'Voto Claro no certifica profesionales, no garantiza resultados, honorarios, cumplimiento de servicios ni idoneidad profesional.',
      'Cada usuario debe revisar credenciales, experiencia, costos, condiciones y alcance antes de contratar.',
    ];

    setPageContext({
      pageId: 'espacio-emprendedor-apoyo-profesionales',
      pageTitle: 'Profesionales asesores',
      route: '/espacio-emprendedor/apoyo/profesionales',
      summary:
        'Pantalla orientativa y directorio inicial de profesionales asesores registrados que pueden apoyar a emprendedores en temas legales, contables, financieros, comerciales y de formulación de proyectos.',
      speakableSummary:
        'Estás en Profesionales asesores. Aquí puedes revisar áreas de asesoría, registrar o editar tu ficha profesional y consultar un directorio de profesionales registrados. La información del directorio es declarada por cada profesional. Voto Claro no certifica profesionales ni garantiza resultados.',
      activeSection: loadingProfessionals
        ? 'directorio-profesionales-cargando'
        : professionalsError
        ? 'directorio-profesionales-error'
        : filteredProfessionals.length === 0
        ? 'directorio-profesionales-sin-resultados'
        : 'directorio-profesionales-visible',
      activeViewId: loadingProfessionals
        ? 'loading-directory'
        : professionalsError
        ? 'error-directory'
        : filteredProfessionals.length === 0
        ? 'empty-directory'
        : 'professional-directory',
      activeViewTitle: 'Profesionales asesores',
      breadcrumb: ['Espacio Emprendedor', 'Centro de Apoyo', 'Profesionales'],
      visibleSections: [
        'presentacion',
        'registro-profesional',
        'directorio-profesionales',
        'areas-profesionales',
        'checklist-contratacion',
        'advertencia-responsabilidad',
      ],
      visibleActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Registrar o editar ficha profesional',
        'Buscar profesional',
        'Filtrar por tipo profesional',
        'Revisar áreas profesionales',
        'Revisar checklist antes de contratar',
      ],
      availableActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Registrar o editar ficha profesional',
        'Buscar profesional',
        'Filtrar por tipo profesional',
        'Revisar áreas profesionales',
        'Revisar checklist antes de contratar',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle:
        filteredProfessionals[0]?.public_name || 'Profesionales asesores',
      status: loadingProfessionals ? 'loading' : professionalsError ? 'error' : 'ready',
      suggestedPrompts: [
        {
          id: 'ee-prof-1',
          label: '¿Qué hay aquí?',
          question: '¿Qué puedo encontrar en esta pantalla de profesionales asesores?',
        },
        {
          id: 'ee-prof-2',
          label: '¿Qué asesor necesito?',
          question: '¿Qué tipo de profesional podría necesitar para mejorar mi proyecto?',
        },
        {
          id: 'ee-prof-3',
          label: 'Antes de contratar',
          question: '¿Qué debo revisar antes de contratar a un profesional?',
        },
        {
          id: 'ee-prof-4',
          label: 'Contrato con inversionista',
          question: '¿Qué profesional podría ayudarme si tengo dudas sobre un contrato con un inversionista?',
        },
        {
          id: 'ee-prof-5',
          label: 'Responsabilidad',
          question: '¿Voto Claro garantiza el trabajo de los profesionales?',
        },
        {
          id: 'ee-prof-6',
          label: 'Registrar o editar',
          question: '¿Dónde puedo registrar o editar mi ficha profesional?',
        },
        {
          id: 'ee-prof-7',
          label: 'Directorio',
          question: '¿Cuántos profesionales registrados se ven en el directorio?',
        },
      ],
      dynamicData: {
        professionalGuideVisible: true,
        professionalAreasCount: PROFESSIONAL_AREAS.length,
        checklistCount: CHECKLIST.length,
        directoryModeEnabled: true,
        professionalRegistrationVisible: true,
        canOpenProfessionalRegistration: true,
        professionalRegistrationRoute:
          '/espacio-emprendedor/apoyo/profesionales/registro',
        professionalCodeRequired: true,
        professionalCodeIsPublicIdentifier: true,
        professionalsLoading: loadingProfessionals,
        professionalsError: professionalsError || null,
        professionalsCount: professionals.length,
        filteredProfessionalsCount: filteredProfessionals.length,
        searchTerm: searchTerm.trim() || null,
        selectedType,
        visibleProfessionalNames,
        visibleProfessionalCodes,
        disclaimer:
          'Voto Claro no certifica profesionales, no garantiza contratación, honorarios, resultados ni cumplimiento de servicios.',
      },
      contextVersion: 'ee-apoyo-profesionales-v4-botones-edicion',
    });

    return () => {
      clearPageContext();
    };
  }, [
    setPageContext,
    clearPageContext,
    professionals,
    filteredProfessionals,
    loadingProfessionals,
    professionalsError,
    searchTerm,
    selectedType,
  ]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Profesionales asesores
          </h1>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goToPath('/espacio-emprendedor/apoyo')}
              className="relative z-20 cursor-pointer bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition vc-btn-wave vc-btn-pulse"
            >
              ← Centro de Apoyo
            </button>

            <button
              type="button"
              onClick={() => goToPath('/espacio-emprendedor')}
              className="relative z-20 cursor-pointer bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition vc-btn-wave vc-btn-pulse"
            >
              Espacio Emprendedor
            </button>
          </div>
        </div>

        <section className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm vc-fade-up">
          <p className="text-slate-700 text-lg font-semibold">
            👩‍💼 Busca orientación antes de asumir compromisos importantes.
          </p>

          <p className="text-slate-600 text-sm mt-3">
            Un proyecto puede necesitar apoyo legal, contable, financiero, comercial o técnico antes
            de presentarse a posibles interesados, inversionistas o aliados.
          </p>

          <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <h2 className="text-sm font-bold text-emerald-900 mb-2">
              ¿Eres profesional y deseas participar como asesor?
            </h2>

            <p className="text-sm text-emerald-900 mb-3">
              Registra o edita tu ficha profesional, declara tus especialidades, servicios ofrecidos,
              modalidad de atención y sube un documento PDF de respaldo. Al guardar tu ficha,
              obtendrás un código profesional único.
            </p>

            <button
              type="button"
              onClick={() =>
                goToPath('/espacio-emprendedor/apoyo/profesionales/registro')
              }
              className="relative z-20 cursor-pointer bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-800 transition vc-btn-wave vc-btn-pulse"
            >
              Registrar o editar mi ficha profesional →
            </button>

            <p className="text-xs text-emerald-800 mt-3">
              El registro no significa certificación, validación o aval de Voto Claro.
              El código profesional es un identificador público, no una clave de acceso.
              Para editar tu ficha debes ingresar con tu sesión o código de participante.
            </p>
          </div>

          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Aviso importante:</strong> Esta sección es orientativa. Voto Claro no certifica profesionales,
            no garantiza calidad del servicio, honorarios, resultados, contratación ni cumplimiento de acuerdos.
            Cada usuario debe revisar credenciales, experiencia, costos, condiciones y alcance antes de contratar.
          </div>
        </section>

        <section className="mt-6 bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm vc-fade-up">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                📚 Directorio de profesionales registrados
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Revisa profesionales que han registrado una ficha dentro de la plataforma. La información es declarada por cada profesional.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                goToPath('/espacio-emprendedor/apoyo/profesionales/registro')
              }
              className="relative z-20 cursor-pointer bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition vc-btn-wave vc-btn-pulse"
            >
              Editar o registrar mi ficha
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Buscar por nombre, código, especialidad o servicio
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ej: contrato, contador, PRO-2026..."
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Tipo profesional
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                {professionalTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingProfessionals ? (
            <p className="text-slate-600 text-sm">Cargando profesionales registrados...</p>
          ) : professionalsError ? (
            <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4 text-sm">
              {professionalsError}
            </div>
          ) : filteredProfessionals.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
              <p className="text-slate-600 text-sm">
                No hay profesionales visibles con los filtros actuales.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedType('Todos');
                }}
                className="mt-3 text-green-700 hover:underline text-sm font-semibold"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProfessionals.map((professional) => (
                <div
                  key={professional.id}
                  className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm vc-card-hover"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {professional.public_name}
                      </h3>

                      <p className="text-sm font-semibold text-blue-700 mt-1">
                        {professional.professional_type}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="inline-block text-[11px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full px-2 py-1 whitespace-nowrap">
                        {professional.codigo_profesional}
                      </span>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[150px]">
                        Código público, no es clave de acceso.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    📍 {getLocationLabel(professional)}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    🧭 Atención: {professional.attention_mode || 'No especificada'}
                  </div>

                  {professional.specialties?.length ? (
                    <div className="mt-3">
                      <p className="text-xs font-bold text-slate-700 mb-1">
                        Especialidades
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {professional.specialties.slice(0, 5).map((item) => (
                          <span
                            key={item}
                            className="text-[11px] bg-green-50 text-green-800 border border-green-200 rounded-full px-2 py-1"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {professional.services?.length ? (
                    <div className="mt-3">
                      <p className="text-xs font-bold text-slate-700 mb-1">
                        Servicios
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {professional.services.slice(0, 5).map((item) => (
                          <span
                            key={item}
                            className="text-[11px] bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-1"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {professional.public_message ? (
                    <p className="mt-3 text-sm text-slate-700">
                      “{shortText(professional.public_message, 160)}”
                    </p>
                  ) : professional.experience_summary ? (
                    <p className="mt-3 text-sm text-slate-700">
                      {shortText(professional.experience_summary, 160)}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">
                      Este profesional aún no agregó un mensaje público.
                    </p>
                  )}
                  {professional.document_url && (
  <a
    href={professional.document_url}
    target="_blank"
    rel="noopener noreferrer"
    className="relative z-20 cursor-pointer mt-4 block w-full text-center bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition"
  >
    📄 Ver currículo / respaldo PDF
  </a>
)}
                   {professional.is_mine && (
  <button
    type="button"
    onClick={() =>
      goToPath('/espacio-emprendedor/apoyo/profesionales/registro')
    }
    className="relative z-20 cursor-pointer mt-4 w-full bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-800 transition vc-btn-wave vc-btn-pulse"
  >
    ✏️ Editar mi ficha profesional
  </button>
)}
                  <div className="mt-4 text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-2">
                    Información declarada por el profesional. Verifica credenciales,
                    honorarios y condiciones antes de contratar.
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {PROFESSIONAL_AREAS.map((item, index) => (
            <div
              key={item.title}
              className={`bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm vc-fade-up vc-card-hover ${
                index % 2 === 0 ? 'vc-delay-1' : 'vc-delay-2'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl leading-none">{item.icon}</div>

                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {item.title}
                  </h2>

                  <p className="text-sm text-slate-600 mt-2">
                    {item.description}
                  </p>

                  <ul className="mt-3 space-y-1 text-sm text-slate-700 list-disc pl-5">
                    {item.tasks.map((task) => (
                      <li key={task}>{task}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-sm vc-fade-up">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            ✅ Checklist antes de contratar asesoría
          </h2>

          <p className="text-sm text-slate-600 mb-4">
            Antes de pagar, firmar o entregar información sensible, revisa estos puntos.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CHECKLIST.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 bg-white rounded-2xl border-2 border-emerald-600 p-6 shadow-sm vc-fade-up">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            🔎 Próxima etapa de esta sección
          </h2>

          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Más adelante, esta pantalla podrá convertirse en un directorio más avanzado,
              con perfil público individual, calificaciones internas, reportes, disponibilidad,
              atención virtual, documentos de respaldo y filtros por especialidad.
            </p>

            <p>
              Para proteger a la plataforma, el perfil del profesional debe mostrarse como información declarada
              por el propio profesional, no como certificación oficial de Voto Claro.
            </p>

            <p>
              Si se crea un sistema de calificaciones, debe evaluar la experiencia dentro de la plataforma,
              como claridad, respeto, puntualidad y utilidad del servicio, evitando acusaciones personales o afirmaciones no verificadas.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}