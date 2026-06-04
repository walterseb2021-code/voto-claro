'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

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

export default function ProfesionalesApoyoPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  useEffect(() => {
    const visibleParts = [
      'Pantalla visible: Profesionales asesores del Centro de Apoyo al Emprendedor.',
      'Esta pantalla muestra áreas profesionales que pueden ayudar a mejorar un proyecto emprendedor.',
      'La información es orientativa y no constituye recomendación directa de contratación.',
      'Hay un acceso visible para que una persona pueda registrarse como profesional asesor.',
      'Para participar como profesional asesor, el usuario debe llenar su ficha profesional y obtener su código profesional único.',
      'Voto Claro no certifica profesionales, no garantiza resultados, honorarios, cumplimiento de servicios ni idoneidad profesional.',
      'Cada usuario debe revisar credenciales, experiencia, costos, condiciones y alcance antes de contratar.',
    ];

    setPageContext({
      pageId: 'espacio-emprendedor-apoyo-profesionales',
      pageTitle: 'Profesionales asesores',
      route: '/espacio-emprendedor/apoyo/profesionales',
      summary:
        'Pantalla orientativa sobre profesionales asesores que pueden apoyar a emprendedores en temas legales, contables, financieros, comerciales y de formulación de proyectos, con acceso al registro de ficha profesional.',
      speakableSummary:
        'Estás en Profesionales asesores. Aquí puedes revisar qué tipo de asesoría podría ayudarte a mejorar tu proyecto, como legal, contable, financiera, formulación de proyectos, marketing o propiedad intelectual. También puedes registrarte como profesional asesor llenando tu ficha profesional. Voto Claro no certifica profesionales ni garantiza resultados.',
      activeSection: 'profesionales-asesores',
      activeViewId: 'professional-advisors',
      activeViewTitle: 'Profesionales asesores',
      breadcrumb: ['Espacio Emprendedor', 'Centro de Apoyo', 'Profesionales'],
      visibleSections: [
        'presentacion',
        'registro-profesional',
        'areas-profesionales',
        'checklist-contratacion',
        'advertencia-responsabilidad',
      ],
      visibleActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Registrarme como profesional asesor',
        'Revisar áreas profesionales',
        'Revisar checklist antes de contratar',
      ],
      availableActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Registrarme como profesional asesor',
        'Revisar áreas profesionales',
        'Revisar checklist antes de contratar',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: 'Profesionales asesores',
      status: 'ready',
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
          label: 'Registrarme como asesor',
          question: '¿Dónde puedo registrarme como profesional asesor?',
        },
      ],
      dynamicData: {
        professionalGuideVisible: true,
        professionalAreasCount: PROFESSIONAL_AREAS.length,
        checklistCount: CHECKLIST.length,
        directoryModeEnabled: false,
        professionalRegistrationVisible: true,
        canOpenProfessionalRegistration: true,
        professionalRegistrationRoute:
          '/espacio-emprendedor/apoyo/profesionales/registro',
        professionalCodeRequired: true,
        disclaimer:
          'Voto Claro no certifica profesionales, no garantiza contratación, honorarios, resultados ni cumplimiento de servicios.',
      },
      contextVersion: 'ee-apoyo-profesionales-v2',
    });

    return () => {
      clearPageContext();
    };
  }, [setPageContext, clearPageContext]);

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
              onClick={() => router.push('/espacio-emprendedor/apoyo')}
              className="bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition vc-btn-wave vc-btn-pulse"
            >
              ← Centro de Apoyo
            </button>

            <button
              type="button"
              onClick={() => router.push('/espacio-emprendedor')}
              className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition vc-btn-wave vc-btn-pulse"
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
              Registra tu ficha profesional, declara tus especialidades, servicios ofrecidos,
              modalidad de atención y sube un documento PDF de respaldo. Al guardar tu ficha,
              obtendrás un código profesional único.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push('/espacio-emprendedor/apoyo/profesionales/registro')
              }
              className="bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-800 transition vc-btn-wave vc-btn-pulse"
            >
              Registrarme como profesional asesor →
            </button>

            <p className="text-xs text-emerald-800 mt-3">
              El registro no significa certificación, validación o aval de Voto Claro. La información será
              declarada por el propio profesional y deberá ser verificada por cada usuario interesado.
            </p>
          </div>

          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Aviso importante:</strong> Esta sección es orientativa. Voto Claro no certifica profesionales,
            no garantiza calidad del servicio, honorarios, resultados, contratación ni cumplimiento de acuerdos.
            Cada usuario debe revisar credenciales, experiencia, costos, condiciones y alcance antes de contratar.
          </div>
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
              Más adelante, esta pantalla podrá convertirse en un directorio de profesionales registrados,
              con especialidad, ciudad, atención virtual, experiencia declarada, documentos de respaldo,
              calificaciones y reportes.
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