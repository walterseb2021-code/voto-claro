'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

// Categorías permitidas
const CATEGORIAS = [
  'Ambiente',
  'Educación',
  'Seguridad',
  'Salud',
  'Cultura',
  'Deporte',
  'Infraestructura',
  'Otros',
];

const MIN_SUPPORTS_REQUIRED = 100;
const MAX_PROJECT_BUDGET = 30000;
const OFFICIAL_TEMPLATE_DOCX = '/docs/proyecto-ciudadano/formato_oficial_proyecto_ciudadano.docx';
const OFFICIAL_TEMPLATE_PDF = '/docs/proyecto-ciudadano/formato_oficial_proyecto_ciudadano.pdf';

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

function deriveBudgetCategory(amount: number | null): string | null {
  if (amount == null || Number.isNaN(amount) || amount <= 0) return null;
  if (amount <= 10000) return 'hasta_10000';
  if (amount <= 20000) return 'hasta_20000';
  if (amount <= 30000) return 'hasta_30000';
  return null;
}

function getBudgetCategoryLabel(category: string | null): string {
  if (category === 'hasta_10000') return 'Hasta S/10,000';
  if (category === 'hasta_20000') return 'Hasta S/20,000';
  if (category === 'hasta_30000') return 'Hasta S/30,000';
  return 'Sin categoría presupuestal';
}

export default function NuevoProyectoPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [participant, setParticipant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
  name: '',
  category: '',
  objective: '',
  description: '',
  district: '',
  department: '',
  requested_budget: '',
  data_truth_confirmed: false,
});
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [cycle, setCycle] = useState<any>(null);

  const requestedBudgetNumber =
    form.requested_budget.trim() === ''
      ? null
      : Number(form.requested_budget);

  const derivedBudgetCategory = deriveBudgetCategory(
    requestedBudgetNumber != null && !Number.isNaN(requestedBudgetNumber)
      ? requestedBudgetNumber
      : null
  );

  const derivedBudgetCategoryLabel = getBudgetCategoryLabel(derivedBudgetCategory);

  // Cargar datos del participante y ciclo activo
  useEffect(() => {
    async function loadData() {
      const deviceId = localStorage.getItem('vc_device_id');
      if (!deviceId) {
        router.push('/proyecto-ciudadano/registro');
        return;
      }

      const { data: participantData, error: participantError } = await supabase
        .from('project_participants')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (participantError || !participantData) {
        router.push('/proyecto-ciudadano/registro');
        return;
      }

      setParticipant(participantData);

      const { data: cycleData, error: cycleError } = await supabase
        .from('project_cycles')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (cycleError) {
        console.error('Error cargando ciclo:', cycleError);
      } else {
        setCycle(cycleData);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);
   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  const target = e.target;
  const value =
    target instanceof HTMLInputElement && target.type === 'checkbox'
      ? target.checked
      : target.value;

  setForm({ ...form, [target.name]: value });
};

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (!form.name || !form.category || !form.objective || !form.description || !form.district) {
      setError('Todos los campos son obligatorios.');
      setSubmitting(false);
      return;
    }

    if (!form.department) {
      setError('Debes seleccionar un departamento.');
      setSubmitting(false);
      return;
    }

    if (!form.requested_budget.trim()) {
      setError('Debes indicar el monto solicitado del proyecto.');
      setSubmitting(false);
      return;
    }

    if (requestedBudgetNumber == null || Number.isNaN(requestedBudgetNumber) || requestedBudgetNumber <= 0) {
      setError('El monto solicitado debe ser un número válido mayor que cero.');
      setSubmitting(false);
      return;
    }

    if (requestedBudgetNumber > MAX_PROJECT_BUDGET) {
      setError(`El monto solicitado no puede superar S/${MAX_PROJECT_BUDGET.toLocaleString('es-PE')}.`);
      setSubmitting(false);
      return;
    }

       if (!form.data_truth_confirmed) {
  setError('Debes declarar que la información presentada es real, actualizada y cuenta con el consentimiento de las personas incluidas.');
  setSubmitting(false);
  return;
}

    if (!pdfFile) {
      setError('Debes subir el archivo PDF del proyecto.');
      setSubmitting(false);
      return;
    }

    if (pdfFile.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF.');
      setSubmitting(false);
      return;
    }

    if (pdfFile.size > 10 * 1024 * 1024) {
      setError('El archivo no debe superar los 10 MB.');
      setSubmitting(false);
      return;
    }

    try {
         if (!cycle?.id) {
  setError('No hay un ciclo activo disponible para presentar proyectos en este momento.');
  setSubmitting(false);
  return;
}

const { data: existingLeaderProject, error: existingLeaderError } = await supabase
  .from('projects')
  .select('id, name, status')
  .eq('cycle_id', cycle.id)
  .eq('leader_id', participant.id)
  .in('status', ['pending', 'active'])
  .maybeSingle();

if (existingLeaderError) {
  console.error('Error verificando proyecto existente del líder:', existingLeaderError);
}

if (existingLeaderProject) {
  setError('Ya tienes un proyecto registrado en el ciclo actual. No puedes presentar otro hasta que termine el trimestre de este concurso.');
  setSubmitting(false);
  return;
}


      const fileExt = pdfFile.name.split('.').pop();
      const fileName = `${participant.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('project_pdfs')
        .upload(fileName, pdfFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('project_pdfs')
        .getPublicUrl(fileName);

      const pdfUrl = urlData.publicUrl;

      const { error: insertError } = await supabase
        .from('projects')
        .insert({
          cycle_id: cycle?.id,
          leader_id: participant.id,
          name: form.name,
          category: form.category,
          objective: form.objective,
          description: form.description,
          district: form.district,
          department: form.department,
          requested_budget: requestedBudgetNumber,
          budget_category: derivedBudgetCategory,
          minimum_supports_required: MIN_SUPPORTS_REQUIRED,
          eligible_for_final_review: false,
          pdf_url: pdfUrl,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => {
        router.push('/proyecto-ciudadano');
      }, 3000);
    } catch (err: any) {
      console.error('Error al guardar proyecto:', err);
      setError(err.message || 'Error al guardar el proyecto. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const filledFields = [
      form.name ? 'nombre del proyecto' : null,
      form.category ? 'categoría temática' : null,
      form.objective ? 'objetivo general' : null,
      form.description ? 'descripción' : null,
      form.district ? 'distrito' : null,
      form.department ? 'departamento' : null,
      form.requested_budget ? 'monto solicitado' : null,
    ].filter(Boolean) as string[];

    const missingFields = [
      !form.name ? 'nombre del proyecto' : null,
      !form.category ? 'categoría temática' : null,
      !form.objective ? 'objetivo general' : null,
      !form.description ? 'descripción' : null,
      !form.district ? 'distrito' : null,
      !form.department ? 'departamento' : null,
      !form.requested_budget ? 'monto solicitado' : null,
      !pdfFile ? 'archivo PDF' : null,
    ].filter(Boolean) as string[];

    const activeSection = loading
      ? 'nuevo-proyecto-cargando'
      : success
      ? 'nuevo-proyecto-enviado'
      : submitting
      ? 'nuevo-proyecto-enviando'
      : 'nuevo-proyecto-formulario';

    const activeViewId = loading
      ? 'loading'
      : success
      ? 'success'
      : submitting
      ? 'submitting'
      : 'form';

    const activeViewTitle = loading
      ? 'Cargando formulario de proyecto'
      : success
      ? 'Proyecto enviado'
      : submitting
      ? 'Enviando proyecto'
      : 'Formulario de nuevo proyecto';

    const visibleParts: string[] = [];

    if (loading) {
      visibleParts.push('La pantalla para presentar proyecto está cargando.');
    }

    if (participant) {
      visibleParts.push(`Participante visible: ${participant.full_name || participant.alias || 'participante registrado'}.`);
    } else if (!loading) {
      visibleParts.push('No se muestra un participante válido en esta pantalla.');
    }

    if (cycle?.id) {
      visibleParts.push('Hay un ciclo activo disponible para registrar el proyecto.');
    } else if (!loading) {
      visibleParts.push('No se muestra un ciclo activo confirmado en esta pantalla.');
    }

    if (!success && !loading) {
      visibleParts.push('Está visible el formulario para presentar un nuevo proyecto.');
      if (filledFields.length) {
        visibleParts.push(`Campos con contenido: ${filledFields.join(', ')}.`);
      }
      if (missingFields.length) {
        visibleParts.push(`Campos pendientes: ${missingFields.join(', ')}.`);
      }
      if (form.category) {
        visibleParts.push(`Categoría temática seleccionada: ${form.category}.`);
      }
      if (form.department) {
        visibleParts.push(`Departamento seleccionado: ${form.department}.`);
      }
      if (form.requested_budget) {
        visibleParts.push(`Monto solicitado visible: S/${form.requested_budget}.`);
      }
      if (derivedBudgetCategory) {
        visibleParts.push(`Categoría presupuestal derivada: ${derivedBudgetCategoryLabel}.`);
      } else if (form.requested_budget) {
        visibleParts.push('El monto visible todavía no cae en una categoría presupuestal válida.');
      }
      if (pdfFile) {
        visibleParts.push(`PDF cargado: ${pdfFile.name}.`);
      } else {
        visibleParts.push('Todavía no hay un archivo PDF cargado.');
      }
    }

    visibleParts.push(`Regla visible del programa: el proyecto necesita al menos ${MIN_SUPPORTS_REQUIRED} apoyos vecinales válidos para entrar a evaluación final.`);
    visibleParts.push(`Ponderación visible de evaluación: ${EVALUATION_WEIGHTS.citizenSupport} puntos por respaldo ciudadano y ${EVALUATION_WEIGHTS.projectQuality} puntos por calidad del proyecto.`);
    visibleParts.push(`Criterios visibles de calidad: ${EVALUATION_CRITERIA.join(', ')}.`);
    visibleParts.push('Hay acceso visible para descargar el formato oficial del proyecto en DOCX y ver el modelo en PDF.');

    if (error) {
      visibleParts.push(`Error visible: ${error}.`);
    }

    if (submitting) {
      visibleParts.push('El proyecto se está enviando en este momento.');
    }

    if (success) {
      visibleParts.push('El proyecto ya fue enviado y aparece el mensaje de éxito.');
      visibleParts.push('La acción visible permite volver a Proyecto Ciudadano.');
    }

    const availableActions = success
      ? ['Volver a Proyecto Ciudadano']
      : [
          'Volver',
          'Descargar formato oficial en DOCX',
          'Ver formato modelo en PDF',
          'Enviar proyecto',
        ];

    const suggestedPrompts = success
      ? [
          {
            id: 'pc-nuevo-1',
            label: '¿Ya se envió?',
            question: '¿Ya se envió mi proyecto en esta pantalla?',
          },
          {
            id: 'pc-nuevo-2',
            label: '¿Qué pasa ahora?',
            question: '¿Qué pasa ahora después de enviar este proyecto?',
          },
          {
            id: 'pc-nuevo-3',
            label: '¿A dónde vuelve?',
            question: '¿A dónde me lleva la acción visible después del envío?',
          },
        ]
      : [
          {
            id: 'pc-nuevo-1',
            label: '¿Qué me falta?',
            question: '¿Qué me falta completar en este formulario para enviar el proyecto?',
          },
          {
            id: 'pc-nuevo-2',
            label: '¿Qué monto tengo?',
            question: '¿Qué monto solicitado está visible en este formulario?',
          },
          {
            id: 'pc-nuevo-3',
            label: '¿Qué categoría presupuestal me corresponde?',
            question: '¿Qué categoría presupuestal le corresponde a este proyecto según el monto visible?',
          },
          {
            id: 'pc-nuevo-4',
            label: '¿Ya cargué el PDF?',
            question: '¿Ya cargué el PDF del proyecto en esta pantalla?',
          },
          {
            id: 'pc-nuevo-5',
            label: '¿Dónde descargo el formato?',
            question: '¿Dónde puedo descargar el formato oficial del proyecto desde esta pantalla?',
          },
        ];

    const summary = loading
      ? 'Pantalla de nuevo proyecto cargando datos del participante y del ciclo activo.'
      : success
      ? 'Pantalla de nuevo proyecto con envío exitoso y mensaje de confirmación visible.'
      : 'Pantalla de nuevo proyecto con formulario visible, monto solicitado, categoría presupuestal derivada, formato oficial descargable y estado de envío.';

    setPageContext({
      pageId: 'proyecto-ciudadano-nuevo-proyecto',
      pageTitle: 'Presentar nuevo proyecto',
      route: '/proyecto-ciudadano/nuevo-proyecto',
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Proyecto Ciudadano', 'Nuevo proyecto', activeViewTitle],
      visibleSections: success
        ? ['resultado-envio', 'confirmacion', 'retorno']
        : [
            'cabecera',
            'descripcion',
            'formato-oficial-del-proyecto',
            'reglas-de-participacion',
            'formulario',
            'bases-del-premio',
          ],
      visibleActions: availableActions,
      availableActions,
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: form.name || undefined,
      selectedCategory: form.category || undefined,
      status: loading || submitting ? 'loading' : error ? 'error' : 'ready',
      suggestedPrompts,
      dynamicData: {
        participantVisible: !!participant,
        participantName: participant?.full_name || participant?.alias || null,
        cycleActive: !!cycle?.id,
        cycleId: cycle?.id || null,
        loading,
        submitting,
        success,
        error: error || null,
        filledFields,
        missingFields,
        pdfLoaded: !!pdfFile,
        pdfFileName: pdfFile?.name || null,
        pdfFileSize: pdfFile?.size || null,
        officialTemplateAvailable: true,
        officialTemplateDocxUrl: OFFICIAL_TEMPLATE_DOCX,
        officialTemplatePdfUrl: OFFICIAL_TEMPLATE_PDF,
        minimumSupportsRequired: MIN_SUPPORTS_REQUIRED,
        requestedBudget: requestedBudgetNumber,
        budgetCategory: derivedBudgetCategory,
        budgetCategoryLabel: derivedBudgetCategoryLabel,
        maxProjectBudget: MAX_PROJECT_BUDGET,
        evaluationWeights: EVALUATION_WEIGHTS,
        evaluationCriteria: EVALUATION_CRITERIA,
        formValues: {
          name: form.name || null,
          category: form.category || null,
          objective: form.objective || null,
          description: form.description || null,
          district: form.district || null,
          department: form.department || null,
          requested_budget: form.requested_budget || null,
        },
      },
      contextVersion: 'pc-nuevo-proyecto-v2',
    });
  }, [
    setPageContext,
    participant,
    loading,
    submitting,
    error,
    success,
    form,
    pdfFile,
    cycle,
    requestedBudgetNumber,
    derivedBudgetCategory,
    derivedBudgetCategoryLabel,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-white rounded-2xl border-2 border-green-600 p-8 shadow-sm">
            <div className="text-6xl mb-4">📄✅</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Proyecto enviado!</h1>
            <p className="text-slate-600 mb-4">
              Tu proyecto ha sido recibido y está en revisión por el administrador. Recibirás notificación cuando sea aprobado.
            </p>
            <Link
              href="/proyecto-ciudadano"
              className="inline-block bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800"
            >
              Volver a Proyecto Ciudadano
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Presentar nuevo proyecto</h1>
          <Link href="/proyecto-ciudadano" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-indigo-600 p-5 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2">📄 Formato oficial del proyecto</h2>
          <p className="text-slate-600 text-sm mb-4">
            Descarga el formato oficial, complétalo con la información del proyecto y luego súbelo en PDF en este formulario.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href={OFFICIAL_TEMPLATE_DOCX}
              download
              className="inline-block bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-indigo-800 transition"
            >
              ⬇️ Descargar formato editable (.docx)
            </a>

            <a
              href={OFFICIAL_TEMPLATE_PDF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-slate-200 text-slate-800 px-4 py-2 rounded-xl font-semibold hover:bg-slate-300 transition"
            >
              👁️ Ver formato modelo (.pdf)
            </a>
          </div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-emerald-600 p-5 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2">📋 Reglas de participación</h2>
          <div className="space-y-2 text-sm text-slate-700">
            <p>Tu proyecto necesita <strong>al menos 100 apoyos vecinales válidos</strong> para entrar a evaluación final.</p>
            <p>Las categorías presupuestales son: <strong>hasta S/10,000</strong>, <strong>hasta S/20,000</strong> y <strong>hasta S/30,000</strong>.</p>
            <p>La evaluación final combina <strong>40 puntos por respaldo ciudadano</strong> y <strong>60 puntos por calidad del proyecto</strong>.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <p className="text-slate-600 mb-4 text-sm">
            Completa la información de tu proyecto. Debe beneficiar a tu comunidad y no tener fines particulares.
            El proyecto será revisado antes de ser publicado.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre del proyecto *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Categoría temática *</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              >
                <option value="">Selecciona una categoría</option>
                {CATEGORIAS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Objetivo general *</label>
              <textarea
                name="objective"
                value={form.objective}
                onChange={handleChange}
                rows={3}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Descripción del proyecto *</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={5}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Distrito de ejecución *</label>
              <input
                type="text"
                name="district"
                value={form.district}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Departamento o región del proyecto *</label>
              <select
                name="department"
                value={form.department}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              >
                <p className="text-xs text-slate-500 mt-1">
  Este dato sirve para identificar en qué región se ejecutará el proyecto. Pueden presentarse varios proyectos de una misma región.
</p>
                <option value="">Selecciona un departamento</option>
                <option value="Amazonas">Amazonas</option>
                <option value="Áncash">Áncash</option>
                <option value="Apurímac">Apurímac</option>
                <option value="Arequipa">Arequipa</option>
                <option value="Ayacucho">Ayacucho</option>
                <option value="Cajamarca">Cajamarca</option>
                <option value="Callao">Callao</option>
                <option value="Cusco">Cusco</option>
                <option value="Huancavelica">Huancavelica</option>
                <option value="Huánuco">Huánuco</option>
                <option value="Ica">Ica</option>
                <option value="Junín">Junín</option>
                <option value="La Libertad">La Libertad</option>
                <option value="Lambayeque">Lambayeque</option>
                <option value="Lima">Lima</option>
                <option value="Loreto">Loreto</option>
                <option value="Madre de Dios">Madre de Dios</option>
                <option value="Moquegua">Moquegua</option>
                <option value="Pasco">Pasco</option>
                <option value="Piura">Piura</option>
                <option value="Puno">Puno</option>
                <option value="San Martín">San Martín</option>
                <option value="Tacna">Tacna</option>
                <option value="Tumbes">Tumbes</option>
                <option value="Ucayali">Ucayali</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Monto solicitado (S/.) *</label>
              <input
                type="number"
                name="requested_budget"
                value={form.requested_budget}
                onChange={handleChange}
                min="1"
                max={MAX_PROJECT_BUDGET}
                step="0.01"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                El monto solicitado no puede superar S/{MAX_PROJECT_BUDGET.toLocaleString('es-PE')}.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-800">
                Categoría presupuestal detectada: {derivedBudgetCategory ? derivedBudgetCategoryLabel : 'Completa el monto solicitado'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Archivo PDF del proyecto *</label>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Máximo 10 MB. Solo PDF.</p>
            </div>

            <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
              <strong>⚠️ Bases del premio:</strong> Los premios consisten en un <strong>fondo concursable</strong> para la ejecución del proyecto.
              El monto se entrega en <strong>materiales, herramientas e insumos</strong>, pagados directamente a proveedores.
              No se entrega dinero en efectivo al ganador. El proyecto debe ajustarse al monto otorgado (S/30,000 / S/20,000 / S/10,000).
              La mano de obra puede ser voluntaria (propia del comité) o estar presupuestada, en cuyo caso se paga directamente a los trabajadores.
            </div>
              <div className="bg-yellow-50 rounded-xl border border-yellow-300 p-4 text-sm text-yellow-800">
  <strong>📌 Importante:</strong> El proyecto debe presentarse con el PDF oficial completo y el monto solicitado no puede superar S/30,000.
</div>

<div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
  <h3 className="text-sm font-bold text-amber-900 mb-2">Declaración obligatoria del postulante</h3>

  <div className="space-y-2 text-sm text-amber-900">
    <p>
      El correo, celular y demás datos consignados en tu ficha deben ser reales, estar actualizados y pertenecer al ciudadano responsable de esta postulación.
    </p>
    <p>
      Si se comprueba que alguna persona no existe, que se usaron nombres sin consentimiento o que la información presentada es falsa, la postulación quedará descalificada.
    </p>
  </div>

  <label className="flex items-start gap-2 mt-3 text-sm text-slate-700">
    <input
      type="checkbox"
      name="data_truth_confirmed"
      checked={form.data_truth_confirmed}
      onChange={handleChange}
      className="mt-1"
    />
    <span>
      Declaro que la información presentada es verdadera, actualizada y que cuento con el consentimiento de las personas incluidas en esta postulación.
    </span>
  </label>
</div>
            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Enviar proyecto'}
              </button>
            </div>
          </form>

          <p className="text-xs text-slate-500 mt-4 text-center">
            El proyecto será revisado por el administrador antes de ser publicado. Solo se aceptan proyectos que beneficien a la comunidad.
          </p>
        </div>
      </div>
    </main>
  );
}