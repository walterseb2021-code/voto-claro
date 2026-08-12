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

const MAX_PROJECT_BUDGET = 30000;
const MAX_PDF_SIZE_MB = 10;
const OFFICIAL_TEMPLATE_DOCX = '/docs/proyecto-ciudadano/formato_oficial_proyecto_ciudadano.docx';
const OFFICIAL_TEMPLATE_PDF = '/docs/proyecto-ciudadano/ejemplo_proyecto_ciudadano_lleno.pdf';

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

function sanitizeText(value: string) {
  return String(value || '').trim();
}

function sanitizeMoneyInput(value: string) {
  return value.replace(/[^\d.]/g, '').slice(0, 12);
}

function getProtectedFileName(file: File | null) {
  if (!file) return null;
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  return `archivo-proyecto.${ext}`;
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
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [hasExistingProject, setHasExistingProject] = useState(false);

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
  const minimumSupportsRequired =
    typeof cycle?.min_supports === 'number' && cycle.min_supports > 0
      ? cycle.min_supports
      : null;

  // Cargar sesión segura del participante y estado server-side del ciclo
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/proyecto-ciudadano/submission', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        const result = await response.json().catch(() => null);

        if (response.status === 401) {
          router.push('/proyecto-ciudadano');
          return;
        }

        if (!response.ok || !result?.ok) {
          setError('No se pudo verificar el estado de la convocatoria. Intenta nuevamente más tarde.');
          setLoading(false);
          return;
        }

        setParticipant(result.participant || null);
        setCycle(result.cycle || null);
        setSubmissionOpen(Boolean(result.submission_open));
        setHasExistingProject(Boolean(result.existing_project));

        if (!result.submission_open) {
          setError(
            'La convocatoria está cerrada. No se reciben nuevos proyectos en este momento.'
          );
        } else if (result.existing_project) {
          setError(
            'Ya tienes un proyecto registrado en el ciclo actual. No puedes presentar otro mientras siga vigente este ciclo.'
          );
        }
      } catch {
        setError('No se pudo verificar el estado de la convocatoria. Revisa tu conexión e intenta nuevamente.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      setForm({ ...form, [target.name]: target.checked });
      return;
    }

    if (target.name === 'requested_budget') {
      setForm({ ...form, requested_budget: sanitizeMoneyInput(target.value) });
      return;
    }

    setForm({ ...form, [target.name]: target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;

    if (!selected) {
      setPdfFile(null);
      return;
    }

    if (selected.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF.');
      setPdfFile(null);
      e.target.value = '';
      return;
    }

    if (selected.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
      setError(`El archivo no debe superar los ${MAX_PDF_SIZE_MB} MB.`);
      setPdfFile(null);
      e.target.value = '';
      return;
    }

    setError(null);
    setPdfFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const cleanName = sanitizeText(form.name);
    const cleanCategory = sanitizeText(form.category);
    const cleanObjective = sanitizeText(form.objective);
    const cleanDescription = sanitizeText(form.description);
    const cleanDistrict = sanitizeText(form.district);
    const cleanDepartment = sanitizeText(form.department);

    if (
      !cleanName ||
      !cleanCategory ||
      !cleanObjective ||
      !cleanDescription ||
      !cleanDistrict ||
      !cleanDepartment
    ) {
      setError('Todos los campos son obligatorios.');
      setSubmitting(false);
      return;
    }

    if (!form.requested_budget.trim()) {
      setError('Debes indicar el monto solicitado del proyecto.');
      setSubmitting(false);
      return;
    }

    if (
      requestedBudgetNumber == null ||
      Number.isNaN(requestedBudgetNumber) ||
      requestedBudgetNumber <= 0
    ) {
      setError('El monto solicitado debe ser un número válido mayor que cero.');
      setSubmitting(false);
      return;
    }

    if (requestedBudgetNumber > MAX_PROJECT_BUDGET) {
      setError(`El monto solicitado no puede superar S/${MAX_PROJECT_BUDGET.toLocaleString('es-PE')}.`);
      setSubmitting(false);
      return;
    }

    if (!derivedBudgetCategory) {
      setError('El monto solicitado no corresponde a una categoría presupuestal válida.');
      setSubmitting(false);
      return;
    }

    if (!form.data_truth_confirmed) {
      setError(
        'Debes declarar que la información presentada es real, actualizada y cuenta con el consentimiento de las personas incluidas.'
      );
      setSubmitting(false);
      return;
    }

    if (!submissionOpen) {
      setError('No hay un ciclo abierto para recibir nuevos proyectos en este momento.');
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

    if (pdfFile.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
      setError(`El archivo no debe superar los ${MAX_PDF_SIZE_MB} MB.`);
      setSubmitting(false);
      return;
    }

    try {
      const uploadInitResponse = await fetch(
        '/api/proyecto-ciudadano/submission/upload',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            file_name: pdfFile.name,
            file_type: pdfFile.type,
            file_size: pdfFile.size,
          }),
        }
      );

      const uploadInit = await uploadInitResponse.json().catch(() => null);

      if (!uploadInitResponse.ok || !uploadInit?.ok) {
        if (uploadInitResponse.status === 401) {
          router.push('/proyecto-ciudadano');
          return;
        }

        if (uploadInitResponse.status === 409) {
          setError(
            uploadInit?.error === 'participant_has_open_project'
              ? 'Ya tienes un proyecto registrado en el ciclo actual.'
              : 'La convocatoria no está abierta para recibir proyectos en este momento.'
          );
        } else if (uploadInitResponse.status === 429) {
          setError('Se realizaron demasiados intentos de carga. Espera antes de volver a intentar.');
        } else if (uploadInitResponse.status === 400) {
          setError('El archivo PDF no cumple los requisitos de carga.');
        } else {
          setError('No se pudo preparar la carga segura del PDF. Intenta nuevamente.');
        }

        setSubmitting(false);
        return;
      }

      const uploadPath =
        typeof uploadInit.path === 'string' ? uploadInit.path : '';
      const uploadToken =
        typeof uploadInit.token === 'string' ? uploadInit.token : '';
      const uploadGrantId =
        typeof uploadInit.upload_grant_id === 'string'
          ? uploadInit.upload_grant_id
          : '';

      if (!uploadPath || !uploadToken || !uploadGrantId) {
        setError('No se pudo preparar la carga segura del PDF.');
        setSubmitting(false);
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from('project_pdfs')
        .uploadToSignedUrl(uploadPath, uploadToken, pdfFile, {
          contentType: 'application/pdf',
          cacheControl: '3600',
        });

      if (uploadError) {
        setError('No se pudo subir el PDF. Intenta nuevamente.');
        setSubmitting(false);
        return;
      }

      const finalizeResponse = await fetch(
        '/api/proyecto-ciudadano/submission/finalize',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            upload_grant_id: uploadGrantId,
            name: cleanName,
            category: cleanCategory,
            objective: cleanObjective,
            description: cleanDescription,
            district: cleanDistrict,
            department: cleanDepartment,
            requested_budget: requestedBudgetNumber,
            data_truth_confirmed: true,
          }),
        }
      );

      const finalizeResult = await finalizeResponse.json().catch(() => null);

      if (!finalizeResponse.ok || !finalizeResult?.ok) {
        if (finalizeResponse.status === 401) {
          router.push('/proyecto-ciudadano');
          return;
        }

        if (finalizeResponse.status === 409) {
          setError(
            finalizeResult?.error === 'participant_has_open_project'
              ? 'Ya tienes un proyecto registrado en el ciclo actual.'
              : finalizeResult?.error === 'submission_closed'
                ? 'La convocatoria dejó de estar abierta antes de completar el envío.'
                : 'No se pudo validar de forma segura el PDF o la postulación.'
          );
        } else if (finalizeResponse.status === 400) {
          setError('Revisa los datos del proyecto y vuelve a intentar.');
        } else {
          setError('No se pudo finalizar el registro del proyecto. Intenta nuevamente.');
        }

        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/proyecto-ciudadano');
      }, 3000);
    } catch {
      setError('No se pudo completar el envío. Revisa tu conexión e intenta nuevamente.');
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
      form.data_truth_confirmed ? 'declaración obligatoria' : null,
    ].filter(Boolean) as string[];

    const missingFields = [
      !form.name ? 'nombre del proyecto' : null,
      !form.category ? 'categoría temática' : null,
      !form.objective ? 'objetivo general' : null,
      !form.description ? 'descripción' : null,
      !form.district ? 'distrito' : null,
      !form.department ? 'departamento' : null,
      !form.requested_budget ? 'monto solicitado' : null,
      !form.data_truth_confirmed ? 'declaración obligatoria' : null,
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
      visibleParts.push('Hay un participante registrado visible para esta sesión, sin exponer datos personales completos al asistente.');
    } else if (!loading) {
      visibleParts.push('No se muestra un participante válido en esta pantalla.');
    }

    if (cycle?.id) {
      visibleParts.push(
        submissionOpen
          ? 'Hay un ciclo abierto disponible para registrar el proyecto.'
          : 'Hay un ciclo configurado, pero actualmente está fuera de su ventana de recepción.'
      );
    } else if (!loading) {
      visibleParts.push('No se muestra un ciclo configurado para esta pantalla.');
    }

    if (!success && !loading) {
      visibleParts.push(
        submissionOpen && !hasExistingProject
          ? 'Está visible el formulario para presentar un nuevo proyecto.'
          : !submissionOpen
            ? 'La convocatoria está cerrada y el formulario de postulación no está disponible.'
            : 'El participante ya tiene un proyecto registrado en el ciclo actual y no puede presentar otro.'
      );

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
        visibleParts.push('Hay un archivo PDF cargado para el proyecto, sin exponer el nombre original del archivo al asistente.');
      } else {
        visibleParts.push('Todavía no hay un archivo PDF cargado.');
      }

      visibleParts.push(
        form.data_truth_confirmed
          ? 'La declaración obligatoria del postulante está marcada.'
          : 'La declaración obligatoria del postulante todavía no está marcada.'
      );
    }

    visibleParts.push(
      minimumSupportsRequired != null
        ? `Regla visible del programa: el proyecto necesita al menos ${minimumSupportsRequired} apoyos vecinales válidos para entrar a evaluación final.`
        : 'El mínimo de apoyos de la convocatoria no pudo confirmarse en este momento.'
    );
    visibleParts.push(
      `Ponderación referencial visible de evaluación: ${EVALUATION_WEIGHTS.citizenSupport} puntos por respaldo ciudadano y ${EVALUATION_WEIGHTS.projectQuality} puntos por calidad del proyecto, sujeta a validación.`
    );
    visibleParts.push(`Criterios visibles de calidad: ${EVALUATION_CRITERIA.join(', ')}.`);
    visibleParts.push('Hay acceso visible para descargar el formato oficial del proyecto en DOCX y ver el modelo en PDF.');
    visibleParts.push('Cualquier reconocimiento, apoyo o premio queda sujeto a bases, validación y disponibilidad de la organización.');

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
          submissionOpen && !hasExistingProject ? 'Aceptar declaración obligatoria' : null,
          submissionOpen && !hasExistingProject ? 'Enviar proyecto' : null,
        ].filter(Boolean) as string[];

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
            label: 'Monto solicitado',
            question: '¿Qué monto solicitado está visible en este formulario?',
          },
          {
            id: 'pc-nuevo-3',
            label: 'Categoría presupuestal',
            question: '¿Qué categoría presupuestal le corresponde a este proyecto según el monto visible?',
          },
          {
            id: 'pc-nuevo-4',
            label: 'PDF del proyecto',
            question: '¿Ya cargué el PDF del proyecto en esta pantalla?',
          },
          {
            id: 'pc-nuevo-5',
            label: 'Formato oficial',
            question: '¿Dónde puedo descargar el formato oficial del proyecto desde esta pantalla?',
          },
        ];

    const summary = loading
      ? 'Pantalla de nuevo proyecto cargando datos del participante y del ciclo activo.'
      : success
      ? 'Pantalla de nuevo proyecto con envío exitoso y mensaje de confirmación visible.'
      : 'Pantalla de nuevo proyecto con formulario visible, monto solicitado, categoría presupuestal derivada, formato oficial descargable, declaración obligatoria y estado de envío.';

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
            'declaracion-obligatoria',
            'aviso-reconocimientos',
          ],
      visibleActions: availableActions,
      availableActions,
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: form.name ? 'Proyecto en edición' : undefined,
      selectedCategory: form.category || undefined,
      status: loading || submitting ? 'loading' : error ? 'error' : 'ready',
      suggestedPrompts,
      dynamicData: {
        participantVisible: !!participant,
        participantDataProtected: true,
        cycleActive: submissionOpen,
        hasExistingProject,
        canSubmitProject: submissionOpen && !hasExistingProject,
        cycleIdVisible: !!cycle?.id,
        loading,
        submitting,
        success,
        error: error || null,
        filledFields,
        missingFields,
        pdfLoaded: !!pdfFile,
        pdfFileNameProtected: pdfFile ? getProtectedFileName(pdfFile) : null,
        pdfFileSize: pdfFile?.size || null,
        officialTemplateAvailable: true,
        officialTemplateDocxUrl: OFFICIAL_TEMPLATE_DOCX,
        officialTemplatePdfUrl: OFFICIAL_TEMPLATE_PDF,
        minimumSupportsRequired: minimumSupportsRequired,
        requestedBudget: requestedBudgetNumber,
        budgetCategory: derivedBudgetCategory,
        budgetCategoryLabel: derivedBudgetCategoryLabel,
        maxProjectBudget: MAX_PROJECT_BUDGET,
        evaluationWeights: EVALUATION_WEIGHTS,
        evaluationCriteria: EVALUATION_CRITERIA,
        dataTruthConfirmed: form.data_truth_confirmed,
        formValuesProtected: {
          nameFilled: !!form.name,
          category: form.category || null,
          objectiveFilled: !!form.objective,
          descriptionFilled: !!form.description,
          districtFilled: !!form.district,
          department: form.department || null,
          requestedBudgetFilled: !!form.requested_budget,
        },
        recognitionRule:
          'Todo reconocimiento, apoyo o premio queda sujeto a bases, validación y disponibilidad de la organización.',
      },
      contextVersion: 'pc-nuevo-proyecto-v3',
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
    submissionOpen,
    hasExistingProject,
    minimumSupportsRequired,
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
              Tu proyecto ha sido recibido para revisión. Será publicado o evaluado según las reglas de la convocatoria y la validación de la organización.
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
            Descarga el formato editable vacío, complétalo con la información del proyecto y luego súbelo en PDF en este formulario. También puedes revisar un ejemplo llenado para guiarte sobre el nivel de detalle esperado.
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
              👁️ Ver ejemplo (.pdf)
            </a>
          </div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-emerald-600 p-5 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2">📋 Reglas de participación</h2>
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Tu proyecto necesita <strong>
                {minimumSupportsRequired != null
                  ? `al menos ${minimumSupportsRequired} apoyos vecinales válidos`
                  : 'el mínimo de apoyos definido por la convocatoria'}
              </strong> para entrar a evaluación final.
            </p>
            <p>
              Las categorías presupuestales son: <strong>hasta S/10,000</strong>, <strong>hasta S/20,000</strong> y <strong>hasta S/30,000</strong>.
            </p>
            <p>
              La evaluación referencial combina <strong>40 puntos por respaldo ciudadano</strong> y <strong>60 puntos por calidad del proyecto</strong>,
              sin perjuicio de la validación final de la organización.
            </p>
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

          {submissionOpen && !hasExistingProject ? (
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
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
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
              <p className="text-xs text-slate-500 mt-1">
                Este dato sirve para identificar en qué región se ejecutará el proyecto. Pueden presentarse varios proyectos de una misma región.
              </p>
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
                Categoría presupuestal detectada:{' '}
                {derivedBudgetCategory ? derivedBudgetCategoryLabel : 'Completa el monto solicitado'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Archivo PDF del proyecto *</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Máximo {MAX_PDF_SIZE_MB} MB. Solo PDF. No incluyas datos sensibles innecesarios en el archivo.
              </p>
            </div>

            <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
              <strong>⚠️ Aviso sobre reconocimientos:</strong> Cualquier premio, fondo, apoyo, reconocimiento o entrega de materiales
              estará sujeto a las bases oficiales de la convocatoria, validación del proyecto, disponibilidad presupuestal y verificación
              de la organización. No se garantiza entrega automática de dinero ni beneficio económico directo por presentar un proyecto.
            </div>

            <div className="bg-yellow-50 rounded-xl border border-yellow-300 p-4 text-sm text-yellow-800">
              <strong>📌 Importante:</strong> El proyecto debe presentarse con el PDF oficial completo y el monto solicitado no puede superar S/{MAX_PROJECT_BUDGET.toLocaleString('es-PE')}.
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h3 className="text-sm font-bold text-amber-900 mb-2">Declaración obligatoria del postulante</h3>

              <div className="space-y-2 text-sm text-amber-900">
                <p>
                  El correo, celular y demás datos consignados en tu ficha deben ser reales, estar actualizados y pertenecer al ciudadano responsable de esta postulación.
                </p>
                <p>
                  Si se comprueba que se usaron datos falsos, nombres sin consentimiento o información fraudulenta, la postulación podrá ser observada, rechazada o retirada conforme a las reglas de participación.
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
                  Declaro que la información presentada es verdadera, actualizada, que cuento con el consentimiento de las personas incluidas en esta postulación y que acepto las reglas de revisión, publicación y tratamiento de datos aplicables.
                </span>
              </label>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting || !form.data_truth_confirmed || !submissionOpen}
                className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Enviar proyecto'}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-amber-500 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-3">
              {submissionOpen ? 'Postulación no disponible' : 'Convocatoria cerrada'}
            </h2>
            <p className="text-slate-700 mb-4">
              {error ||
                (submissionOpen
                  ? 'Ya tienes un proyecto registrado en el ciclo actual.'
                  : 'Actualmente no se reciben nuevos proyectos.')}
            </p>
            <p className="text-sm text-slate-600 mb-4">
              Puedes descargar y revisar el formato oficial, pero el formulario de envío permanecerá bloqueado hasta que exista una convocatoria habilitada y tu sesión cumpla las reglas de participación.
            </p>
            <Link
              href="/proyecto-ciudadano/proyectos"
              className="inline-block bg-slate-200 text-slate-800 px-5 py-2 rounded-xl font-semibold hover:bg-slate-300"
            >
              Ver proyectos activos
            </Link>
          </div>
        )}

          <p className="text-xs text-slate-500 mt-4 text-center leading-relaxed">
            El proyecto será revisado por el administrador antes de ser publicado. Solo se aceptan proyectos que beneficien a la comunidad.
            La presentación no garantiza aprobación, publicación, premio, reconocimiento ni financiamiento.
          </p>
        </div>
      </div>
    </main>
  );
}