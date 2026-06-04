'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

const GUIDE_STEPS = [
  {
    icon: '💡',
    title: '1. Ordena tu idea',
    text:
      'Define qué problema quieres resolver, a quién beneficia tu propuesta y por qué tu solución puede ser útil o diferente.',
    points: [
      'Describe el problema en pocas líneas.',
      'Identifica a quién afecta.',
      'Explica por qué vale la pena resolverlo.',
    ],
  },
  {
    icon: '🎯',
    title: '2. Define tu solución',
    text:
      'Explica qué producto, servicio o iniciativa vas a ofrecer y cómo funcionará en la práctica.',
    points: [
      'Qué vas a hacer.',
      'Cómo lo vas a ejecutar.',
      'Qué resultado esperas lograr.',
    ],
  },
  {
    icon: '👥',
    title: '3. Identifica tu público o mercado',
    text:
      'Señala quiénes podrían usar, comprar, apoyar o beneficiarse con tu proyecto.',
    points: [
      'Clientes o usuarios principales.',
      'Zona donde funcionará el proyecto.',
      'Necesidad que atiende.',
    ],
  },
  {
    icon: '💰',
    title: '4. Calcula costos e inversión referencial',
    text:
      'Prepara un presupuesto simple y realista. La inversión debe ser referencial y sustentada, no una promesa de rentabilidad.',
    points: [
      'Materiales, equipos o herramientas.',
      'Mano de obra o servicios necesarios.',
      'Gastos operativos iniciales.',
    ],
  },
  {
    icon: '📄',
    title: '5. Prepara un PDF claro',
    text:
      'El PDF debe permitir que otra persona entienda tu proyecto sin que tengas que explicarlo todo verbalmente.',
    points: [
      'Resumen ejecutivo.',
      'Problema y solución.',
      'Presupuesto referencial.',
      'Fotos, evidencias o avances si existen.',
    ],
  },
  {
    icon: '🤝',
    title: '6. Antes de contactar interesados',
    text:
      'Revisa bien a la otra parte, evita entregar información sensible sin cuidado y no firmes documentos que no entiendas.',
    points: [
      'Verifica identidad y antecedentes básicos.',
      'No aceptes presiones para decidir rápido.',
      'Busca asesoría legal o contable si hay dinero o contratos.',
    ],
  },
];

const CHECKLIST = [
  '¿El problema está claramente explicado?',
  '¿La solución se entiende sin explicaciones adicionales?',
  '¿El proyecto beneficia a clientes, comunidad o un mercado identificable?',
  '¿El presupuesto es razonable y está sustentado?',
  '¿El PDF tiene información ordenada y legible?',
  '¿No prometes rentabilidad garantizada?',
  '¿Incluiste datos de contacto solo si estás seguro de publicarlos?',
  '¿Revisarás cualquier acuerdo con asesoría antes de firmar?',
];

export default function GuiaApoyoEmprendedorPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  useEffect(() => {
    const visibleParts = [
      'Pantalla visible: Guía práctica del Centro de Apoyo al Emprendedor.',
      'La guía explica cómo ordenar una idea, definir el problema, presentar la solución, calcular costos, preparar un PDF y revisar cuidados antes de contactar interesados.',
      'La pantalla contiene una lista de pasos prácticos y una lista de verificación antes de publicar o contactar posibles inversionistas.',
      'Voto Claro no garantiza financiamiento, inversión, rentabilidad, asesoría profesional ni cierre de acuerdos.',
      'La información es orientativa y no reemplaza asesoría legal, contable, tributaria o financiera independiente.',
    ];

    setPageContext({
      pageId: 'espacio-emprendedor-apoyo-guia',
      pageTitle: 'Guía práctica para preparar tu proyecto',
      route: '/espacio-emprendedor/apoyo/guia',
      summary:
        'Guía práctica del Centro de Apoyo al Emprendedor para ordenar ideas, preparar proyectos, calcular costos referenciales y revisar cuidados antes de contactar interesados.',
      speakableSummary:
        'Estás en la guía práctica para preparar tu proyecto. Aquí encontrarás pasos para ordenar tu idea, explicar el problema, presentar la solución, preparar un presupuesto referencial, armar un PDF claro y revisar cuidados antes de contactar interesados. Esta guía es orientativa y no reemplaza asesoría profesional.',
      activeSection: 'guia-practica-proyecto',
      activeViewId: 'project-guide',
      activeViewTitle: 'Guía práctica para preparar tu proyecto',
      breadcrumb: ['Espacio Emprendedor', 'Centro de Apoyo', 'Guía práctica'],
      visibleSections: [
        'presentacion',
        'pasos-para-preparar-proyecto',
        'checklist-previo',
        'advertencia-legal-financiera',
      ],
      visibleActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Revisar pasos',
        'Revisar checklist',
      ],
      availableActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Revisar pasos',
        'Revisar checklist',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: 'Guía práctica para preparar tu proyecto',
      status: 'ready',
      suggestedPrompts: [
        {
          id: 'ee-guia-1',
          label: '¿Cómo empiezo?',
          question: '¿Cómo empiezo a ordenar mi idea de proyecto?',
        },
        {
          id: 'ee-guia-2',
          label: '¿Qué debe tener mi PDF?',
          question: '¿Qué debería incluir el PDF de mi proyecto?',
        },
        {
          id: 'ee-guia-3',
          label: '¿Cómo calculo costos?',
          question: '¿Qué debo considerar para calcular costos e inversión referencial?',
        },
        {
          id: 'ee-guia-4',
          label: 'Antes de contactar',
          question: '¿Qué debo revisar antes de contactar a un posible inversionista o aliado?',
        },
        {
          id: 'ee-guia-5',
          label: 'Checklist',
          question: '¿Qué puntos debo revisar antes de publicar mi proyecto?',
        },
      ],
      dynamicData: {
        guideVisible: true,
        stepsCount: GUIDE_STEPS.length,
        checklistCount: CHECKLIST.length,
        legalDisclaimer:
          'La guía es orientativa. Voto Claro no garantiza financiamiento, inversión, rentabilidad ni cierre de acuerdos.',
        professionalAdviceRecommended: true,
      },
      contextVersion: 'ee-apoyo-guia-v1',
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
            Guía práctica para preparar tu proyecto
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
            📘 Convierte una idea suelta en un proyecto más claro, sustentado y presentable.
          </p>

          <p className="text-slate-600 text-sm mt-3">
            Esta guía te ayuda a ordenar tu propuesta antes de publicarla, contactar posibles interesados
            o conversar con profesionales. No reemplaza asesoría legal, contable, tributaria ni financiera.
          </p>

          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Aviso importante:</strong> Voto Claro brinda orientación general. No garantiza inversión,
            financiamiento, rentabilidad, contratación profesional, aprobación de proyectos ni cumplimiento de acuerdos.
            Antes de firmar, invertir, asociarte o asumir obligaciones económicas, busca asesoría profesional independiente.
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {GUIDE_STEPS.map((step, index) => (
            <div
              key={step.title}
              className={`bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm vc-fade-up vc-card-hover ${
                index % 2 === 0 ? 'vc-delay-1' : 'vc-delay-2'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl leading-none">{step.icon}</div>

                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {step.title}
                  </h2>

                  <p className="text-sm text-slate-600 mt-2">
                    {step.text}
                  </p>

                  <ul className="mt-3 space-y-1 text-sm text-slate-700 list-disc pl-5">
                    {step.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-sm vc-fade-up">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            ✅ Checklist antes de publicar o contactar interesados
          </h2>

          <p className="text-sm text-slate-600 mb-4">
            Usa esta lista como revisión rápida antes de presentar tu proyecto o iniciar conversaciones.
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
            🧭 Recomendación final
          </h2>

          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Un buen proyecto no solo debe sonar interesante; debe poder explicarse con claridad,
              mostrar costos razonables y permitir que otra persona evalúe sus riesgos.
            </p>

            <p>
              Evita prometer resultados que no puedes garantizar. Presenta tu información como datos,
              supuestos o estimaciones, y conserva documentos que respalden lo que afirmas.
            </p>

            <p>
              Si vas a conversar sobre inversión, sociedad, préstamo, cesión de derechos, participación en utilidades
              o firma de contratos, busca asesoría legal y contable antes de comprometerte.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}