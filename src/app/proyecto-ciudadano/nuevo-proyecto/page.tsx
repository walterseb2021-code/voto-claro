// src/app/proyecto-ciudadano/nuevo-proyecto/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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

    // Validaciones
    if (!form.name || !form.category || !form.objective || !form.description || !form.district) {
      setError('Todos los campos son obligatorios.');
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

    if (pdfFile.size > 50 * 1024 * 1024) {
      setError('El archivo no debe superar los 50 MB.');
      setSubmitting(false);
      return;
    }

    try {
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">Archivo PDF del proyecto *</label>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Máximo 50 MB. Solo PDF.</p>
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