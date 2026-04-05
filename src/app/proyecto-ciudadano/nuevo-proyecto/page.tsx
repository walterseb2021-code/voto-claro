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
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [cycle, setCycle] = useState<any>(null);

  // Cargar datos del participante y ciclo activo
  useEffect(() => {
    async function loadData() {
      const deviceId = localStorage.getItem('vc_device_id');
      if (!deviceId) {
        router.push('/proyecto-ciudadano/registro');
        return;
      }

      // Obtener participante
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

      // Obtener ciclo activo
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

    // Validaciones básicas
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
      // Verificar si ya existe proyecto en este departamento para el ciclo activo
      const { data: existingProject, error: existingError } = await supabase
        .from('projects')
        .select('id')
        .eq('cycle_id', cycle?.id)
        .eq('department', form.department)
        .in('status', ['pending', 'active'])
        .maybeSingle();

      if (existingError) {
        console.error('Error verificando proyecto existente:', existingError);
      }

      if (existingProject) {
        setError(`Ya existe un proyecto registrado para el departamento de ${form.department}. Solo se permite uno por departamento por ciclo.`);
        setSubmitting(false);
        return;
      }

      // 1. Subir PDF a Supabase Storage
      const fileExt = pdfFile.name.split('.').pop();
      const fileName = `${participant.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('project_pdfs')
        .upload(fileName, pdfFile);

      if (uploadError) throw uploadError;

      // Obtener URL pública del PDF
      const { data: urlData } = supabase.storage
        .from('project_pdfs')
        .getPublicUrl(fileName);

      const pdfUrl = urlData.publicUrl;

      // 2. Insertar proyecto en la base de datos
      const { data: project, error: insertError } = await supabase
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
      form.category ? 'categoría' : null,
      form.objective ? 'objetivo general' : null,
      form.description ? 'descripción' : null,
      form.district ? 'distrito' : null,
      form.department ? 'departamento' : null,
    ].filter(Boolean) as string[];

    const missingFields = [
      !form.name ? 'nombre del proyecto' : null,
      !form.category ? 'categoría' : null,
      !form.objective ? 'objetivo general' : null,
      !form.description ? 'descripción' : null,
      !form.district ? 'distrito' : null,
      !form.department ? 'departamento' : null,
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
        visibleParts.push(`Categoría seleccionada: ${form.category}.`);
      }
      if (form.department) {
        visibleParts.push(`Departamento seleccionado: ${form.department}.`);
      }
      if (pdfFile) {
        visibleParts.push(`PDF cargado: ${pdfFile.name}.`);
      } else {
        visibleParts.push('Todavía no hay un archivo PDF cargado.');
      }
    }

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
      : ['Volver', 'Enviar proyecto'];

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
            label: '¿Ya cargué el PDF?',
            question: '¿Ya cargué el PDF del proyecto en esta pantalla?',
          },
          {
            id: 'pc-nuevo-3',
            label: '¿Qué categoría tengo?',
            question: '¿Qué categoría está seleccionada en este formulario?',
          },
          {
            id: 'pc-nuevo-4',
            label: '¿Qué departamento tengo?',
            question: '¿Qué departamento está seleccionado en este formulario?',
          },
          {
            id: 'pc-nuevo-5',
            label: '¿Hay algún error visible?',
            question: '¿Hay algún error visible ahora en esta pantalla?',
          },
        ];

    const summary = loading
      ? 'Pantalla de nuevo proyecto cargando datos del participante y del ciclo activo.'
      : success
      ? 'Pantalla de nuevo proyecto con envío exitoso y mensaje de confirmación visible.'
      : 'Pantalla de nuevo proyecto con formulario visible, validaciones, PDF y estado de envío.';

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
        : ['cabecera', 'descripcion', 'formulario', 'bases-del-premio'],
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
        formValues: {
          name: form.name || null,
          category: form.category || null,
          objective: form.objective || null,
          description: form.description || null,
          district: form.district || null,
          department: form.department || null,
        },
      },
      contextVersion: 'pc-nuevo-proyecto-v1',
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">Categoría *</label>
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">Departamento *</label>
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

            {/* Bases del premio */}
            <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
              <strong>⚠️ Bases del premio:</strong> Los premios consisten en un <strong>fondo concursable</strong> para la ejecución del proyecto.
              El monto se entrega en <strong>materiales, herramientas e insumos</strong>, pagados directamente a proveedores.
              No se entrega dinero en efectivo al ganador. El proyecto debe ajustarse al monto otorgado (S/30,000 / S/20,000 / S/10,000).
              La mano de obra puede ser voluntaria (propia del comité) o estar presupuestada, en cuyo caso se paga directamente a los trabajadores.
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