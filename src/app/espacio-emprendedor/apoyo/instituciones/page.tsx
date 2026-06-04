'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

const INSTITUTION_TYPES = [
  {
    icon: '🏛️',
    title: 'Programas públicos',
    description:
      'Espacios del Estado que pueden ofrecer capacitación, orientación, fondos concursables o programas de fortalecimiento empresarial.',
    examples: [
      'Revisar bases oficiales.',
      'Verificar fechas de convocatoria.',
      'Confirmar requisitos directamente en la página oficial.',
    ],
  },
  {
    icon: '💼',
    title: 'Cámaras de comercio y gremios',
    description:
      'Organizaciones que pueden brindar redes de contacto, capacitaciones, asesoría empresarial o acceso a eventos para emprendedores.',
    examples: [
      'Consultar membresías y costos.',
      'Verificar servicios disponibles.',
      'Revisar experiencia en el rubro del proyecto.',
    ],
  },
  {
    icon: '🎓',
    title: 'Universidades e incubadoras',
    description:
      'Instituciones académicas o incubadoras que pueden ayudar a mejorar modelos de negocio, pitch, validación de mercado o prototipos.',
    examples: [
      'Buscar programas de incubación.',
      'Revisar requisitos de postulación.',
      'Confirmar si aceptan proyectos externos.',
    ],
  },
  {
    icon: '🚀',
    title: 'Aceleradoras y redes de emprendimiento',
    description:
      'Espacios que pueden conectar proyectos con mentores, posibles aliados, inversionistas o programas de crecimiento.',
    examples: [
      'Verificar condiciones de participación.',
      'Revisar si toman participación accionaria.',
      'Evaluar contratos antes de firmar.',
    ],
  },
  {
    icon: '🤝',
    title: 'ONG, fundaciones y cooperación',
    description:
      'Entidades que pueden apoyar proyectos con enfoque social, ambiental, educativo, productivo o comunitario.',
    examples: [
      'Confirmar líneas de apoyo vigentes.',
      'Revisar criterios de elegibilidad.',
      'Verificar si el apoyo es económico, técnico o mixto.',
    ],
  },
  {
    icon: '🏘️',
    title: 'Municipalidades y gobiernos regionales',
    description:
      'Algunas entidades locales pueden ofrecer ferias, capacitaciones, formalización, permisos o programas de apoyo productivo.',
    examples: [
      'Consultar oficinas de desarrollo económico.',
      'Verificar trámites municipales.',
      'Revisar convocatorias locales.',
    ],
  },
];

const CHECKLIST = [
  '¿La institución tiene página oficial o canal verificable?',
  '¿La convocatoria está vigente?',
  '¿Los requisitos son claros?',
  '¿Hay costos, comisiones o condiciones especiales?',
  '¿El apoyo es económico, técnico, comercial o de capacitación?',
  '¿Existe contrato, convenio o bases legales?',
  '¿La institución solicita datos sensibles o pagos anticipados?',
  '¿Necesitas asesoría legal o contable antes de aceptar?',
];

export default function InstitucionesApoyoPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  useEffect(() => {
    const visibleParts = [
      'Pantalla visible: Instituciones y programas de apoyo.',
      'Esta pantalla muestra tipos de instituciones que podrían orientar, capacitar, financiar o acompañar proyectos emprendedores.',
      'La información es orientativa y no contiene convocatoria oficial vigente.',
      'Cada usuario debe verificar requisitos, fechas, costos y condiciones directamente con la institución correspondiente.',
      'Voto Claro no garantiza financiamiento, aprobación, aceptación en programas ni resultados económicos.',
    ];

    setPageContext({
      pageId: 'espacio-emprendedor-apoyo-instituciones',
      pageTitle: 'Instituciones y programas de apoyo',
      route: '/espacio-emprendedor/apoyo/instituciones',
      summary:
        'Pantalla orientativa sobre instituciones y programas que pueden apoyar proyectos emprendedores, con advertencias para verificar fuentes oficiales.',
      speakableSummary:
        'Estás en Instituciones y programas de apoyo. Aquí puedes revisar qué tipos de entidades podrían ayudarte con orientación, capacitación, fondos, incubación o redes de contacto. La información es orientativa y debes verificar requisitos, fechas y condiciones en fuentes oficiales.',
      activeSection: 'instituciones-programas-apoyo',
      activeViewId: 'institutions-support',
      activeViewTitle: 'Instituciones y programas de apoyo',
      breadcrumb: ['Espacio Emprendedor', 'Centro de Apoyo', 'Instituciones'],
      visibleSections: [
        'presentacion',
        'tipos-de-instituciones',
        'checklist-verificacion',
        'advertencia-responsabilidad',
      ],
      visibleActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Revisar tipos de instituciones',
        'Revisar checklist de verificación',
      ],
      availableActions: [
        'Volver al Centro de Apoyo',
        'Volver al Espacio Emprendedor',
        'Revisar tipos de instituciones',
        'Revisar checklist de verificación',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: 'Instituciones y programas de apoyo',
      status: 'ready',
      suggestedPrompts: [
        {
          id: 'ee-inst-1',
          label: '¿Qué hay aquí?',
          question: '¿Qué puedo encontrar en esta pantalla de instituciones y programas?',
        },
        {
          id: 'ee-inst-2',
          label: '¿Cómo verifico?',
          question: '¿Qué debo verificar antes de postular a un programa o institución?',
        },
        {
          id: 'ee-inst-3',
          label: '¿Hay garantía?',
          question: '¿Voto Claro garantiza que una institución me dará financiamiento?',
        },
        {
          id: 'ee-inst-4',
          label: 'Tipos de apoyo',
          question: '¿Qué tipos de apoyo pueden brindar estas instituciones?',
        },
        {
          id: 'ee-inst-5',
          label: 'Antes de aceptar',
          question: '¿Qué debo revisar antes de aceptar apoyo económico o técnico?',
        },
      ],
      dynamicData: {
        institutionsGuideVisible: true,
        institutionTypesCount: INSTITUTION_TYPES.length,
        checklistCount: CHECKLIST.length,
        officialVerificationRequired: true,
        disclaimer:
          'Voto Claro no garantiza financiamiento, aprobación, aceptación en programas ni resultados económicos.',
      },
      contextVersion: 'ee-apoyo-instituciones-v1',
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
            Instituciones y programas de apoyo
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
            🏛️ Explora posibles rutas de apoyo externo para fortalecer tu proyecto.
          </p>

          <p className="text-slate-600 text-sm mt-3">
            Esta sección te orienta sobre qué tipos de instituciones podrían brindar capacitación,
            redes de contacto, apoyo técnico, incubación, aceleración o fondos concursables.
          </p>

          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Aviso importante:</strong> Esta información es orientativa. Voto Claro no garantiza
            financiamiento, aprobación de proyectos, aceptación en programas, vigencia de convocatorias,
            contratación de servicios ni resultados económicos. Verifica siempre la fuente oficial antes de postular,
            pagar, entregar documentos o asumir compromisos.
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {INSTITUTION_TYPES.map((item, index) => (
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
                    {item.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-sm vc-fade-up">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            ✅ Checklist antes de postular o contactar una institución
          </h2>

          <p className="text-sm text-slate-600 mb-4">
            Antes de entregar información, pagar, firmar o aceptar condiciones, revisa estos puntos.
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
            🔎 Próximo paso recomendado
          </h2>

          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Cuando identifiques una institución o programa, busca su página oficial, revisa las bases,
              confirma fechas y guarda evidencia de los requisitos.
            </p>

            <p>
              Si hay dinero, contratos, cesión de derechos, participación en utilidades o compromisos futuros,
              revisa todo con asesoría profesional independiente.
            </p>

            <p>
              En una siguiente etapa, esta sección podrá convertirse en un directorio con instituciones reales,
              enlaces oficiales, filtros y fechas verificadas.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}