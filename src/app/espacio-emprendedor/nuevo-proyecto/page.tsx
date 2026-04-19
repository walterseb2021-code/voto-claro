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
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);

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

      const { data: afiliadoData, error: afiliadoError } = await supabase
        .from('espacio_afiliados')
        .select('*')
        .eq('participant_id', participantData.id)
        .maybeSingle();

      if (afiliadoError || !afiliadoData) {
        router.push('/espacio-emprendedor');
        return;
      }

      setAfiliado(afiliadoData);
      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
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

    if (!form.title || !form.category || !form.department || !form.district || !form.summary) {
      setError('Todos los campos obligatorios deben estar llenos.');
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
      console.log('👤 afiliado:', afiliado);
      console.log('👤 afiliado.id:', afiliado?.id);

      console.log('📦 Datos a insertar:', {
        owner_id: afiliado?.id,
        title: form.title,
        category: form.category,
        department: form.department,
        province: form.province || null,
        district: form.district,
        summary: form.summary,
        investment_min: form.investment_min ? parseInt(form.investment_min) : null,
        investment_max: form.investment_max ? parseInt(form.investment_max) : null,
        status: 'active',
      });

      const fileExt = pdfFile.name.split('.').pop();
      const fileName = `espacio-emprendedor/${afiliado.id}/${Date.now()}.${fileExt}`;
      console.log('📤 Subiendo PDF a:', fileName);

      const { error: uploadError } = await supabase.storage
        .from('project_pdfs')
        .upload(fileName, pdfFile);

      if (uploadError) {
        console.error('❌ Error subiendo PDF:', uploadError);
        throw new Error(`Error al subir PDF: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage.from('project_pdfs').getPublicUrl(fileName);

      const pdfUrl = urlData.publicUrl;
      console.log('✅ PDF subido, URL:', pdfUrl);

      console.log('💾 Insertando proyecto en BD...');

      const { data: newProject, error: insertError } = await supabase
        .from('espacio_proyectos')
        .insert({
          owner_id: afiliado.id,
          title: form.title,
          category: form.category,
          department: form.department,
          province: form.province || null,
          district: form.district,
          summary: form.summary,
          investment_min: form.investment_min ? parseInt(form.investment_min) : null,
          investment_max: form.investment_max ? parseInt(form.investment_max) : null,
          pdf_url: pdfUrl,
          status: 'active',
        })
        .select();

      if (insertError) {
        console.error('❌ Error insertando proyecto:', insertError);
        console.error('❌ Código de error:', insertError.code);
        console.error('❌ Mensaje detallado:', insertError.message);
        throw new Error(`Error al guardar: ${insertError.message} (Código: ${insertError.code})`);
      }

      console.log('✅ Proyecto insertado correctamente:', newProject);

      try {
        await fetch('/api/espacio-emprendedor/notificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectTitle: form.title,
            category: form.category,
            department: form.department,
            investment_min: form.investment_min ? parseInt(form.investment_min) : null,
            investment_max: form.investment_max ? parseInt(form.investment_max) : null,
          }),
        });
      } catch (notifyErr) {
        console.error('Error enviando notificaciones:', notifyErr);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/espacio-emprendedor');
      }, 3000);
    } catch (err: any) {
      console.error('❌ Error completo:', err);
      setError(err.message || 'Error al guardar el proyecto. Intenta nuevamente.');
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

    if (loading) {
      visibleParts.push('La pantalla está cargando el formulario para publicar un nuevo proyecto.');
    }

    if (participant && !loading) {
      visibleParts.push(
        `Participante con sesión activa: ${participant.full_name || participant.alias || 'participante'}.`
      );
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
      visibleParts.push(`Título visible del proyecto: ${titleValue}.`);
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
      visibleParts.push(`Provincia visible: ${provinceValue}.`);
    }

    if (hasDistrict) {
      visibleParts.push(`Distrito visible: ${districtValue}.`);
    } else {
      visibleParts.push('No hay distrito escrito todavía.');
    }

    if (hasSummary) {
      visibleParts.push('El resumen ejecutivo ya tiene contenido visible.');
    } else {
      visibleParts.push('El resumen ejecutivo todavía no tiene contenido visible.');
    }

    if (form.investment_min) {
      visibleParts.push(`Inversión mínima visible: ${form.investment_min}.`);
    }

    if (form.investment_max) {
      visibleParts.push(`Inversión máxima visible: ${form.investment_max}.`);
    }

    if (!hasInvestment) {
      visibleParts.push('No hay monto de inversión visible todavía.');
    }

    visibleParts.push(
      pdfFile
        ? `PDF cargado: ${pdfFile.name}.`
        : 'No hay PDF cargado todavía.'
    );

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
      'Definir inversión',
      pdfFile ? 'Cambiar PDF' : 'Subir PDF',
      'Publicar proyecto',
      'Volver',
    ];

     const summary = loading
  ? 'Pantalla para publicar nuevo proyecto cargando datos del emprendedor.'
  : success
  ? 'Pantalla de publicación de proyecto con confirmación exitosa.'
  : error
  ? 'Pantalla para publicar nuevo proyecto con error visible.'
  : 'Formulario para publicar un nuevo proyecto emprendedor con datos, ubicación, inversión y PDF.';

const speakableSummary = loading
  ? 'Estamos en Publicar nuevo proyecto del Espacio Emprendedor y la pantalla está cargando tus datos como emprendedor.'
  : success
  ? 'Estamos en Publicar nuevo proyecto del Espacio Emprendedor y el proyecto ya fue enviado correctamente.'
  : error
  ? 'Estamos en Publicar nuevo proyecto del Espacio Emprendedor, pero esta pantalla muestra un error.'
  : `Estamos en Publicar nuevo proyecto del Espacio Emprendedor. Aquí puedes completar${
      hasTitle ? ` el proyecto ${titleValue}, ` : ' '
    }la categoría, la ubicación, el resumen ejecutivo, el rango de inversión y subir el PDF del proyecto.`;

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
        'inversion',
        'pdf',
        'envio',
      ],
      suggestedPrompts: [
        {
          id: 'ee-new-1',
          label: '¿Qué me falta para publicar?',
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
      selectedItemTitle: titleValue || participant?.full_name || undefined,
      status,
      dynamicData: {
        participantLogueado: !!participant,
        afiliadoVerificado: !!afiliado,
        submittingProject: submitting,
        success,
        title: titleValue,
        category: form.category,
        department: form.department,
        province: provinceValue,
        district: districtValue,
        hasTitle,
        hasCategory,
        hasDepartment,
        hasProvince,
        hasDistrict,
        hasSummary,
        hasLocation,
        hasInvestment,
        investmentMin: form.investment_min,
        investmentMax: form.investment_max,
        pdfLoaded: !!pdfFile,
        pdfName: pdfFile?.name || '',
        errorVisible: error || '',
        canPublishProject: !!participant && !!afiliado && !!pdfFile,
      },
    });
  }, [setPageContext, loading, participant, afiliado, submitting, success, error, form, pdfFile]);

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
              Tu proyecto ha sido publicado. Los inversionistas interesados podrán contactarte.
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
          <h1 className="text-2xl font-bold text-slate-900">Presentar nuevo proyecto emprendedor</h1>
          <Link href="/espacio-emprendedor" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <p className="text-slate-600 mb-4 text-sm">
            Completa la información de tu proyecto. Los inversionistas interesados podrán contactarte.
          </p>

          <div className="mb-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> La información proporcionada es de exclusiva responsabilidad del autor.
            Voto Claro no verifica la veracidad de los proyectos ni actúa como intermediario financiero.
            Los inversionistas deben realizar su propia evaluación antes de tomar decisiones.
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Inversión mínima (S/)
                </label>
                <input
                  type="number"
                  name="investment_min"
                  value={form.investment_min}
                  onChange={handleChange}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 5000"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Inversión máxima (S/)
                </label>
                <input
                  type="number"
                  name="investment_max"
                  value={form.investment_max}
                  onChange={handleChange}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 50000"
                />
              </div>
            </div>

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
                Máximo 10 MB. Solo PDF. Incluye plan de negocio, proyecciones, etc.
              </p>
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