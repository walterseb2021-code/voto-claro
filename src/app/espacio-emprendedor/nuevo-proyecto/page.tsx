'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

// Categorías permitidas
const CATEGORIAS = [
  'Tecnología',
  'Ventas / Comercio',
  'Inmobiliaria',
  'Construcción',
  'Turismo',
  'Ecología / Medio Ambiente',
  'Agroindustria',
  'Servicios',
  'Otros',
];

// Departamentos del Perú
const DEPARTAMENTOS = [
  'Amazonas',
  'Áncash',
  'Apurímac',
  'Arequipa',
  'Ayacucho',
  'Cajamarca',
  'Callao',
  'Cusco',
  'Huancavelica',
  'Huánuco',
  'Ica',
  'Junín',
  'La Libertad',
  'Lambayeque',
  'Lima',
  'Loreto',
  'Madre de Dios',
  'Moquegua',
  'Pasco',
  'Piura',
  'Puno',
  'San Martín',
  'Tacna',
  'Tumbes',
  'Ucayali',
];

function parseInvestmentAmount(value: string): number | null {
  const clean = value.trim();

  if (!clean) return null;

  const parsed = Number(clean);

  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed);
}

export default function NuevoProyectoEmprendedorPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [participant, setParticipant] = useState<any>(null);
  const [afiliado, setAfiliado] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    title: '',
    category: '',
    department: '',
    province: '',
    district: '',
    summary: '',
    investment_min: '',
    investment_max: '',
    data_truth_confirmed: false,
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const investmentMinNumber = parseInvestmentAmount(form.investment_min);
  const investmentMaxNumber = parseInvestmentAmount(form.investment_max);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const response = await fetch('/api/espacio-emprendedor/me', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        const data = await response.json().catch(() => null);

        if (cancelled) return;

        if (response.status === 401) {
          router.push('/proyecto-ciudadano/registro?returnTo=espacio-emprendedor');
          return;
        }

        if (!response.ok || !data?.participant) {
          setError('No se pudo verificar tu sesión para publicar proyectos. Intenta nuevamente.');
          setLoading(false);
          return;
        }

        setParticipant(data.participant);

        let affiliateData = data.affiliate ?? null;

        if (!affiliateData) {
          const claimResponse = await fetch('/api/espacio-emprendedor/afiliacion', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
          });

          const claimData = await claimResponse.json().catch(() => null);

          if (cancelled) return;

          if (claimResponse.status === 401) {
            router.push('/proyecto-ciudadano/registro?returnTo=espacio-emprendedor');
            return;
          }

          if (claimResponse.status === 404) {
            router.push('/espacio-emprendedor');
            return;
          }

          if (!claimResponse.ok || !claimData?.affiliate) {
            setError('No se pudo confirmar tu afiliación para publicar proyectos.');
            setLoading(false);
            return;
          }

          affiliateData = claimData.affiliate;
        }

        if (affiliateData?.is_active !== true) {
          setError('Tu afiliación no está activa para publicar proyectos.');
          setLoading(false);
          return;
        }

        setAfiliado(affiliateData);
        setLoading(false);
      } catch (loadError) {
        console.error('Error cargando sesión segura de Espacio Emprendedor:', loadError);

        if (!cancelled) {
          setError('No se pudo verificar tu sesión para publicar proyectos. Intenta nuevamente.');
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
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

    const titleValue = form.title.trim();
    const provinceValue = form.province.trim();
    const districtValue = form.district.trim();
    const summaryValue = form.summary.trim();

    if (!titleValue || !form.category || !form.department || !districtValue || !summaryValue) {
      setError('Todos los campos obligatorios deben estar llenos.');
      setSubmitting(false);
      return;
    }

    if (titleValue.length < 5) {
      setError('El título del proyecto debe tener al menos 5 caracteres.');
      setSubmitting(false);
      return;
    }

    if (summaryValue.length < 40) {
      setError('El resumen ejecutivo debe tener al menos 40 caracteres.');
      setSubmitting(false);
      return;
    }

    if (form.investment_min.trim() && investmentMinNumber == null) {
      setError('La inversión mínima debe ser un número válido mayor que cero.');
      setSubmitting(false);
      return;
    }

    if (form.investment_max.trim() && investmentMaxNumber == null) {
      setError('La inversión máxima debe ser un número válido mayor que cero.');
      setSubmitting(false);
      return;
    }

    if (
      investmentMinNumber != null &&
      investmentMaxNumber != null &&
      investmentMaxNumber < investmentMinNumber
    ) {
      setError('La inversión máxima no puede ser menor que la inversión mínima.');
      setSubmitting(false);
      return;
    }

    if (!form.data_truth_confirmed) {
      setError(
        'Debes declarar que la información presentada es verdadera, actualizada y de tu exclusiva responsabilidad.'
      );
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

    if (!afiliado?.id) {
      setError('No se pudo confirmar tu afiliación para publicar el proyecto.');
      setSubmitting(false);
      return;
    }

    try {
      const uploadResponse = await fetch(
        '/api/espacio-emprendedor/proyectos/upload',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            file_name: pdfFile.name,
            file_type: pdfFile.type,
            file_size: pdfFile.size,
          }),
        }
      );

      const uploadInit = await uploadResponse.json().catch(() => null);

      if (!uploadResponse.ok) {
        const code = typeof uploadInit?.error === 'string' ? uploadInit.error : '';

        if (uploadResponse.status === 401) {
          throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
        }

        if (uploadResponse.status === 429) {
          throw new Error('Has realizado demasiados intentos de carga. Espera antes de volver a intentarlo.');
        }

        if (code === 'affiliate_required' || code === 'affiliate_inactive') {
          throw new Error('No se pudo confirmar una afiliación activa para publicar el proyecto.');
        }

        if (code === 'pdf_invalid') {
          throw new Error('El PDF no cumple los requisitos de tipo o tamaño permitidos.');
        }

        throw new Error('No se pudo preparar la carga segura del PDF. Intenta nuevamente.');
      }

      const uploadPath = typeof uploadInit?.path === 'string' ? uploadInit.path : '';
      const uploadToken = typeof uploadInit?.token === 'string' ? uploadInit.token : '';
      const uploadGrantId =
        typeof uploadInit?.upload_grant_id === 'string'
          ? uploadInit.upload_grant_id
          : '';

      if (!uploadPath || !uploadToken || !uploadGrantId) {
        throw new Error('No se pudo preparar la carga segura del PDF. Intenta nuevamente.');
      }

      const { error: uploadError } = await supabase.storage
        .from('project_pdfs')
        .uploadToSignedUrl(uploadPath, uploadToken, pdfFile, {
          contentType: 'application/pdf',
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error('No se pudo subir el PDF. Intenta nuevamente.');
      }

      const finalizeResponse = await fetch(
        '/api/espacio-emprendedor/proyectos/finalize',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            upload_grant_id: uploadGrantId,
            title: titleValue,
            category: form.category,
            department: form.department,
            province: provinceValue || null,
            district: districtValue,
            summary: summaryValue,
            investment_min: investmentMinNumber,
            investment_max: investmentMaxNumber,
            data_truth_confirmed: form.data_truth_confirmed,
          }),
        }
      );

      const finalizeData = await finalizeResponse.json().catch(() => null);

      if (!finalizeResponse.ok) {
        const code =
          typeof finalizeData?.error === 'string' ? finalizeData.error : '';

        if (finalizeResponse.status === 401) {
          throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
        }

        if (code === 'uploaded_pdf_invalid') {
          throw new Error('El archivo cargado no pudo validarse como un PDF seguro. Selecciona nuevamente el PDF.');
        }

        if (code === 'upload_grant_invalid' || code === 'finalize_conflict') {
          throw new Error('La autorización de carga ya no es válida. Intenta publicar nuevamente.');
        }

        if (code === 'affiliate_required') {
          throw new Error('No se pudo confirmar una afiliación activa para publicar el proyecto.');
        }

        if (code === 'request_invalid') {
          throw new Error('Los datos del proyecto no pasaron la validación de seguridad. Revisa el formulario.');
        }

        throw new Error('No se pudo finalizar la publicación segura del proyecto. Intenta nuevamente.');
      }

      const projectId =
        typeof finalizeData?.project_id === 'string'
          ? finalizeData.project_id
          : '';

      if (!projectId) {
        throw new Error('El proyecto fue procesado, pero no se recibió una confirmación válida.');
      }

      setSuccess(true);

      setTimeout(() => {
        router.push('/espacio-emprendedor');
      }, 3000);
    } catch (err: unknown) {
      console.error('Error al guardar proyecto emprendedor:', err);

      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Error al guardar el proyecto. Intenta nuevamente.';

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const visibleParts: string[] = [];

    const titleValue = form.title.trim();
    const provinceValue = form.province.trim();
    const districtValue = form.district.trim();
    const summaryValue = form.summary.trim();

    const hasTitle = !!titleValue;
    const hasCategory = !!form.category;
    const hasDepartment = !!form.department;
    const hasProvince = !!provinceValue;
    const hasDistrict = !!districtValue;
    const hasSummary = !!summaryValue;
    const hasLocation = !!form.department || !!provinceValue || !!districtValue;
    const hasInvestment = !!form.investment_min || !!form.investment_max;

    const activeSection = loading
      ? 'nuevo-proyecto-cargando'
      : success
      ? 'nuevo-proyecto-exito'
      : error
      ? 'nuevo-proyecto-error'
      : 'nuevo-proyecto-formulario';

    const activeViewId = loading
      ? 'loading-form'
      : success
      ? 'success-form'
      : error
      ? 'error-form'
      : 'project-form';

    const activeViewTitle = loading
      ? 'Nuevo proyecto cargando'
      : success
      ? 'Proyecto enviado correctamente'
      : error
      ? 'Nuevo proyecto con error'
      : 'Formulario de nuevo proyecto';

    visibleParts.push(`Vista activa: ${activeViewTitle}.`);
    visibleParts.push('Pantalla visible: Publicar nuevo proyecto del Espacio Emprendedor.');
    visibleParts.push(
      'Esta pantalla permite publicar un proyecto emprendedor para que sea visible por posibles interesados o inversionistas.'
    );
    visibleParts.push(
      'Voto Claro no garantiza inversión, financiamiento, rentabilidad, contacto efectivo, cierre de acuerdos ni aval financiero.'
    );
    visibleParts.push(
      'Los montos de inversión son rangos referenciales declarados por el autor y no constituyen oferta pública ni recomendación financiera.'
    );

    if (loading) {
      visibleParts.push('La pantalla está cargando el formulario para publicar un nuevo proyecto.');
    }

    if (participant && !loading) {
      visibleParts.push('Hay un participante con sesión activa, sin exponer datos personales completos al asistente.');
    }

    if (!participant && !loading) {
      visibleParts.push('No hay participante con sesión activa visible en esta pantalla.');
    }

    if (afiliado && !loading) {
      visibleParts.push('El usuario aparece verificado como afiliado para publicar proyectos.');
    } else if (!loading) {
      visibleParts.push('No se detecta afiliación verificada para publicar proyectos.');
    }

    if (hasTitle) {
      visibleParts.push('Hay un título escrito para el proyecto, sin exponerlo completo al asistente.');
    } else {
      visibleParts.push('No hay título escrito todavía.');
    }

    if (hasCategory) {
      visibleParts.push(`Categoría seleccionada: ${form.category}.`);
    } else {
      visibleParts.push('No hay categoría seleccionada todavía.');
    }

    if (hasDepartment) {
      visibleParts.push(`Departamento seleccionado: ${form.department}.`);
    } else {
      visibleParts.push('No hay departamento seleccionado todavía.');
    }

    if (hasProvince) {
      visibleParts.push('Hay una provincia escrita, sin exponerla completa al asistente.');
    }

    if (hasDistrict) {
      visibleParts.push('Hay un distrito escrito, sin exponerlo completo al asistente.');
    } else {
      visibleParts.push('No hay distrito escrito todavía.');
    }

    if (hasSummary) {
      visibleParts.push('El resumen ejecutivo ya tiene contenido visible, sin exponerlo completo al asistente.');
    } else {
      visibleParts.push('El resumen ejecutivo todavía no tiene contenido visible.');
    }

    if (form.investment_min) {
      visibleParts.push('Hay inversión mínima referencial escrita.');
    }

    if (form.investment_max) {
      visibleParts.push('Hay inversión máxima referencial escrita.');
    }

    if (!hasInvestment) {
      visibleParts.push('No hay monto de inversión visible todavía.');
    }

    visibleParts.push(
      pdfFile ? 'Hay un PDF cargado, sin exponer el nombre del archivo al asistente.' : 'No hay PDF cargado todavía.'
    );

    if (form.data_truth_confirmed) {
      visibleParts.push('La declaración obligatoria del autor está marcada.');
    } else {
      visibleParts.push('La declaración obligatoria del autor todavía no está marcada.');
    }

    if (submitting) {
      visibleParts.push('El formulario del proyecto se está enviando.');
    }

    if (success) {
      visibleParts.push('El proyecto ya fue publicado correctamente.');
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}`);
    }

    const availableActions = [
      'Completar título',
      'Seleccionar categoría',
      'Seleccionar ubicación',
      'Escribir resumen ejecutivo',
      'Definir inversión referencial',
      pdfFile ? 'Cambiar PDF' : 'Subir PDF',
      'Marcar declaración obligatoria',
      'Publicar proyecto',
      'Volver',
    ];

    const summary = loading
      ? 'Pantalla para publicar nuevo proyecto cargando datos del emprendedor.'
      : success
      ? 'Pantalla de publicación de proyecto con confirmación exitosa.'
      : error
      ? 'Pantalla para publicar nuevo proyecto con error visible.'
      : 'Formulario para publicar un nuevo proyecto emprendedor con datos, ubicación, inversión referencial, PDF y declaración obligatoria.';

    const speakableSummary = loading
      ? 'Estamos en Publicar nuevo proyecto del Espacio Emprendedor y la pantalla está cargando tus datos como emprendedor.'
      : success
      ? 'Estamos en Publicar nuevo proyecto del Espacio Emprendedor y el proyecto ya fue enviado correctamente.'
      : error
      ? 'Estamos en Publicar nuevo proyecto del Espacio Emprendedor, pero esta pantalla muestra un error.'
      : 'Estamos en Publicar nuevo proyecto del Espacio Emprendedor. Aquí puedes completar la categoría, la ubicación, el resumen ejecutivo, el rango referencial de inversión y subir el PDF del proyecto. Recuerda que Voto Claro no garantiza inversión, financiamiento ni rentabilidad.';

    const status = loading ? 'loading' : error ? 'error' : 'ready';

    setPageContext({
      pageId: 'espacio-emprendedor-nuevo-proyecto',
      pageTitle: 'Espacio Emprendedor',
      route: '/espacio-emprendedor/nuevo-proyecto',
      summary,
      speakableSummary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Espacio Emprendedor', 'Nuevo proyecto', activeViewTitle],
      visibleSections: [
        'identidad-del-proyecto',
        'ubicacion',
        'resumen',
        'inversion-referencial',
        'pdf',
        'declaracion-obligatoria',
        'envio',
      ],
      suggestedPrompts: [
        {
          id: 'ee-new-1',
          label: '¿Qué me falta?',
          question: 'Según esta pantalla, ¿qué me falta para publicar el proyecto?',
        },
        {
          id: 'ee-new-2',
          label: '¿Ya cargué el PDF?',
          question: '¿Ya cargué el PDF en esta pantalla?',
        },
        {
          id: 'ee-new-3',
          label: '¿Qué categoría tengo?',
          question: '¿Qué categoría tengo seleccionada en esta pantalla?',
        },
        {
          id: 'ee-new-4',
          label: '¿Hay error visible?',
          question: '¿Hay un error visible en esta pantalla?',
        },
        {
          id: 'ee-new-5',
          label: '¿Ya se publicó?',
          question: '¿El proyecto ya fue publicado correctamente o sigo en el formulario?',
        },
      ],
      visibleActions: availableActions,
      visibleText: visibleParts.join('\n'),
      availableActions,
      selectedItemTitle: hasTitle ? 'Proyecto emprendedor en edición' : undefined,
      status,
      dynamicData: {
        participantLogueado: !!participant,
        participantDataProtected: true,
        afiliadoVerificado: !!afiliado,
        submittingProject: submitting,
        success,
        titleProtected: hasTitle,
        category: form.category,
        department: form.department,
        provinceProtected: hasProvince,
        districtProtected: hasDistrict,
        summaryProtected: hasSummary,
        hasTitle,
        hasCategory,
        hasDepartment,
        hasProvince,
        hasDistrict,
        hasSummary,
        hasLocation,
        hasInvestment,
        investmentMinProtected: !!form.investment_min,
        investmentMaxProtected: !!form.investment_max,
        pdfLoaded: !!pdfFile,
        pdfNameProtected: !!pdfFile,
        dataTruthConfirmed: form.data_truth_confirmed,
        errorVisible: error || '',
        canPublishProject:
          !!participant &&
          !!afiliado &&
          !!pdfFile &&
          form.data_truth_confirmed &&
          hasTitle &&
          hasCategory &&
          hasDepartment &&
          hasDistrict &&
          hasSummary,
        investmentDisclaimer:
          'Voto Claro no garantiza inversión, financiamiento, rentabilidad, contacto efectivo ni cierre de acuerdos.',
      },
    });
  }, [
    setPageContext,
    loading,
    participant,
    afiliado,
    submitting,
    success,
    error,
    form,
    pdfFile,
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
              Tu proyecto ha sido publicado como información proporcionada por el autor. Los usuarios interesados podrían contactarte,
              pero Voto Claro no garantiza inversión, financiamiento, rentabilidad ni cierre de acuerdos.
            </p>

            <Link
              href="/espacio-emprendedor"
              className="inline-block bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800"
            >
              Volver al Espacio Emprendedor
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
          <h1 className="text-2xl font-bold text-slate-900">
            Presentar nuevo proyecto emprendedor
          </h1>

          <Link href="/espacio-emprendedor" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <p className="text-slate-600 mb-4 text-sm">
            Completa la información de tu proyecto. Los usuarios interesados podrían contactarte desde la plataforma.
          </p>

          <div className="mb-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> La información proporcionada es de exclusiva responsabilidad del autor.
            Voto Claro no verifica la veracidad económica, técnica ni financiera de los proyectos, no actúa como intermediario financiero
            y no garantiza inversión, financiamiento, rentabilidad, contacto efectivo ni cierre de acuerdos. Los interesados deben realizar
            su propia evaluación antes de tomar cualquier decisión.
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Título del proyecto *
              </label>

              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Categoría *
              </label>

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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Departamento *
              </label>

              <select
                name="department"
                value={form.department}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              >
                <option value="">Selecciona un departamento</option>
                {DEPARTAMENTOS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Provincia (opcional)
              </label>

              <input
                type="text"
                name="province"
                value={form.province}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Distrito *
              </label>

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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Resumen ejecutivo *
              </label>

              <textarea
                name="summary"
                value={form.summary}
                onChange={handleChange}
                rows={4}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                placeholder="Describe brevemente tu proyecto, qué problema resuelve, mercado objetivo y valor agregado."
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Inversión mínima referencial (S/)
                </label>

                <input
                  type="number"
                  name="investment_min"
                  min="1"
                  value={form.investment_min}
                  onChange={handleChange}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 5000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Inversión máxima referencial (S/)
                </label>

                <input
                  type="number"
                  name="investment_max"
                  min="1"
                  value={form.investment_max}
                  onChange={handleChange}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 50000"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Estos montos son rangos referenciales declarados por el autor. No constituyen oferta pública, recomendación financiera ni garantía de inversión.
            </p>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Archivo PDF del proyecto *
              </label>

              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />

              <p className="text-xs text-slate-500 mt-1">
                Máximo 10 MB. Solo PDF. Puedes incluir información del proyecto, plan de negocio y sustento referencial.
              </p>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h3 className="text-sm font-bold text-amber-900 mb-2">
                Declaración obligatoria del autor
              </h3>

              <div className="space-y-2 text-sm text-amber-900">
                <p>
                  Declaro que la información del proyecto es verdadera, actualizada y de mi exclusiva responsabilidad.
                </p>

                <p>
                  Reconozco que Voto Claro no verifica la viabilidad económica, técnica ni financiera del proyecto,
                  no garantiza inversión, financiamiento, rentabilidad ni contacto efectivo, y no actúa como intermediario financiero.
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
                  Acepto esta declaración y autorizo la publicación del proyecto bajo mi responsabilidad.
                </span>
              </label>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Publicar proyecto'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}