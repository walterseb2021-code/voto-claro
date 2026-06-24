'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

export default function CentroApoyoEmprendedorPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  useEffect(() => {
    const visibleParts = [
      'Pantalla visible: Centro de Apoyo al Emprendedor.',
      'Esta pantalla reúne accesos a instituciones, programas, profesionales asesores y una guía práctica para preparar mejor un proyecto emprendedor.',
      'Voto Claro muestra información orientativa y espacios de contacto, pero no garantiza financiamiento, aprobación de proyectos, contratación profesional ni resultados económicos.',
      'El usuario puede abrir instituciones de apoyo, profesionales asesores o una guía práctica para mejorar su proyecto.',
    ];

    setPageContext({
      pageId: 'espacio-emprendedor-apoyo',
      pageTitle: 'Centro de Apoyo al Emprendedor',
      route: '/espacio-emprendedor/apoyo',
      summary:
        'Centro de Apoyo al Emprendedor con accesos a instituciones, profesionales asesores y guía práctica para mejorar proyectos.',
      speakableSummary:
        'Estás en el Centro de Apoyo al Emprendedor. Desde aquí puedes revisar instituciones y programas de apoyo, buscar profesionales asesores o usar una guía práctica para preparar mejor tu proyecto. Recuerda que Voto Claro solo orienta y no garantiza financiamiento ni resultados económicos.',
      activeSection: 'centro-apoyo-principal',
      activeViewId: 'support-center-home',
      activeViewTitle: 'Centro de Apoyo al Emprendedor',
      breadcrumb: ['Espacio Emprendedor', 'Centro de Apoyo'],
      visibleSections: [
        'presentacion',
        'instituciones-programas',
        'profesionales-asesores',
        'guia-practica',
        'aviso-responsabilidad',
      ],
      visibleActions: [
        'Volver al Espacio Emprendedor',
        'Ver instituciones y programas',
        'Buscar profesionales asesores',
        'Abrir guía práctica',
      ],
      availableActions: [
        'Volver al Espacio Emprendedor',
        'Ver instituciones y programas',
        'Buscar profesionales asesores',
        'Abrir guía práctica',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: 'Centro de Apoyo al Emprendedor',
      status: 'ready',
      suggestedPrompts: [
        {
          id: 'ee-apoyo-1',
          label: '¿Qué hay aquí?',
          question: '¿Qué puedo encontrar en el Centro de Apoyo al Emprendedor?',
        },
        {
          id: 'ee-apoyo-2',
          label: 'Instituciones',
          question: '¿Dónde puedo ver instituciones o programas de apoyo?',
        },
        {
          id: 'ee-apoyo-3',
          label: 'Profesionales',
          question: '¿Dónde puedo buscar profesionales asesores?',
        },
        {
          id: 'ee-apoyo-4',
          label: 'Preparar proyecto',
          question: '¿Dónde encuentro una guía para preparar mejor mi proyecto?',
        },
        {
          id: 'ee-apoyo-5',
          label: 'Responsabilidad',
          question: '¿Voto Claro garantiza financiamiento o contratación profesional?',
        },
      ],
      dynamicData: {
        supportCenterVisible: true,
        canOpenInstitutionsSupport: true,
        canOpenProfessionalAdvisors: true,
        canOpenProjectGuide: true,
        disclaimer:
          'Voto Claro muestra información orientativa y espacios de contacto, pero no garantiza financiamiento, contratación profesional ni resultados económicos.',
      },
      contextVersion: 'ee-apoyo-v1',
    });

    return () => {
      clearPageContext();
    };
  }, [setPageContext, clearPageContext]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Centro de Apoyo al Emprendedor
          </h1>

          <button
            type="button"
            onClick={() => router.push('/espacio-emprendedor')}
            className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition vc-btn-wave vc-btn-pulse"
          >
            ← Volver
          </button>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm vc-fade-up">
          <p className="text-slate-700 text-lg font-semibold">
            🤝 Prepara mejor tu proyecto antes de buscar inversión, alianzas o apoyo profesional.
          </p>

          <p className="text-slate-600 text-sm mt-3">
            Este espacio reúne rutas de orientación para que un emprendedor pueda mejorar su idea,
            revisar oportunidades externas, buscar asesoría y tomar decisiones con mayor cuidado.
          </p>

          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Aviso importante:</strong> Voto Claro muestra información orientativa y espacios de contacto.
            No garantiza financiamiento, aprobación de proyectos, contratación de servicios profesionales,
            resultados económicos, rentabilidad ni cumplimiento de acuerdos. Cada usuario debe verificar
            requisitos, credenciales, costos y condiciones directamente con cada institución o profesional.
          </div>
          <div className="mt-3 text-xs text-slate-700 bg-slate-50 border border-slate-300 rounded-lg p-3">
  Los datos compartidos entre usuarios y profesionales serán utilizados únicamente para fines de contacto y coordinación de servicios dentro de la plataforma. Cada usuario es responsable de la información que decide compartir voluntariamente.
</div>
        </div>

        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-sm vc-fade-up vc-card-hover">
            <div className="text-4xl mb-3">🏛️</div>

            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Instituciones y programas
            </h2>

            <p className="text-sm text-slate-600 mb-4">
              Revisa programas públicos, fondos concursables, incubadoras, aceleradoras,
              universidades, cámaras de comercio u otras entidades que podrían brindar orientación o apoyo.
            </p>

            <button
              type="button"
              onClick={() => router.push('/espacio-emprendedor/apoyo/instituciones')}
              className="w-full rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 transition vc-btn-wave vc-btn-pulse"
            >
              Ver instituciones →
            </button>
          </div>

          <div className="bg-white rounded-2xl border-2 border-emerald-600 p-6 shadow-sm vc-fade-up vc-delay-1 vc-card-hover">
            <div className="text-4xl mb-3">👩‍💼</div>

            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Profesionales asesores
            </h2>

            <p className="text-sm text-slate-600 mb-4">
              Encuentra orientación legal, contable, tributaria, financiera, comercial o de formulación
              de proyectos. La contratación, honorarios y resultados dependen de las partes.
            </p>

            <button
              type="button"
              onClick={() => router.push('/espacio-emprendedor/apoyo/profesionales')}
              className="w-full rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 transition vc-btn-wave vc-btn-pulse"
            >
              Buscar profesionales →
            </button>
          </div>

          <div className="bg-white rounded-2xl border-2 border-amber-600 p-6 shadow-sm vc-fade-up vc-delay-2 vc-card-hover">
            <div className="text-4xl mb-3">📘</div>

            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Guía práctica
            </h2>

            <p className="text-sm text-slate-600 mb-4">
              Aprende a ordenar una idea, preparar un resumen ejecutivo, calcular costos,
              presentar un PDF serio y revisar puntos básicos antes de hablar con interesados.
            </p>

            <button
              type="button"
              onClick={() => router.push('/espacio-emprendedor/apoyo/guia')}
              className="w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition vc-btn-wave vc-btn-pulse"
            >
              Abrir guía →
            </button>
          </div>
        </section>

        <div className="mt-6 bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            ¿Qué busca este centro?
          </h2>

          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Ayudar al emprendedor a preparar mejor su proyecto antes de exponerlo ante posibles interesados.
            </p>

            <p>
              Reducir riesgos mediante información clara, documentación, orientación básica y acceso a asesoría externa.
            </p>

            <p>
              Recordar que cualquier decisión de inversión, contratación, alianza o firma de documentos debe ser evaluada
              directamente por las partes y, cuando corresponda, con asesoría profesional independiente.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}