// src/app/espacio-emprendedor/perfil-inversionista/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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

const DEPARTAMENTOS = [
  'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho',
  'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica',
  'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios',
  'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'
];

export default function PerfilInversionistaPage() {
  const router = useRouter();
  const [participant, setParticipant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perfil, setPerfil] = useState({
    company: '',
    investment_range_min: '',
    investment_range_max: '',
    categories: [] as string[],
    departments: [] as string[],
    notify_email: false,
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    const deviceId = localStorage.getItem('vc_device_id');
    if (!deviceId) {
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    try {
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

      // Verificar si ya existe perfil de inversionista
      const { data: perfilData, error: perfilError } = await supabase
        .from('espacio_inversionistas')
        .select('*')
        .eq('participant_id', participantData.id)
        .maybeSingle();

      if (perfilData) {
        setPerfil({
          company: perfilData.company || '',
          investment_range_min: perfilData.investment_range_min?.toString() || '',
          investment_range_max: perfilData.investment_range_max?.toString() || '',
          categories: perfilData.categories || [],
          departments: perfilData.departments || [],
          notify_email: perfilData.notify_email || false,
        });
      }
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setPerfil(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const toggleDepartment = (department: string) => {
    setPerfil(prev => ({
      ...prev,
      departments: prev.departments.includes(department)
        ? prev.departments.filter(d => d !== department)
        : [...prev.departments, department]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('espacio_inversionistas')
        .upsert({
          participant_id: participant.id,
          company: perfil.company || null,
          investment_range_min: perfil.investment_range_min ? parseInt(perfil.investment_range_min) : null,
          investment_range_max: perfil.investment_range_max ? parseInt(perfil.investment_range_max) : null,
          categories: perfil.categories,
          departments: perfil.departments,
          notify_email: perfil.notify_email,
        }, { onConflict: 'participant_id' });

      if (error) throw error;

      setMessage('✅ Perfil guardado correctamente. Recibirás notificaciones de proyectos que coincidan con tus intereses.');
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error('Error guardando perfil:', err);
      setError(err.message || 'Error al guardar perfil');
    } finally {
      setSaving(false);
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Mi perfil inversionista</h1>
          <Link href="/espacio-emprendedor" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <p className="text-slate-600 mb-4 text-sm">
            Configura tus preferencias para recibir notificaciones de proyectos que coincidan con tus intereses.
          </p>

          {message && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl text-sm">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Empresa / Organización (opcional)</label>
              <input
                type="text"
                value={perfil.company}
                onChange={(e) => setPerfil({ ...perfil, company: e.target.value })}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                placeholder="Ej: Inversiones ABC"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Inversión mínima (S/)</label>
                <input
                  type="number"
                  value={perfil.investment_range_min}
                  onChange={(e) => setPerfil({ ...perfil, investment_range_min: e.target.value })}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 5000"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Inversión máxima (S/)</label>
                <input
                  type="number"
                  value={perfil.investment_range_max}
                  onChange={(e) => setPerfil({ ...perfil, investment_range_max: e.target.value })}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 50000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Categorías de interés</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      perfil.categories.includes(cat)
                        ? 'bg-green-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Departamentos de interés</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-xl">
                {DEPARTAMENTOS.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDepartment(dept)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      perfil.departments.includes(dept)
                        ? 'bg-green-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify_email"
                checked={perfil.notify_email}
                onChange={(e) => setPerfil({ ...perfil, notify_email: e.target.checked })}
                className="w-4 h-4 text-green-700 focus:ring-green-500"
              />
              <label htmlFor="notify_email" className="text-sm text-slate-700">
                Recibir notificaciones por correo cuando se publiquen proyectos que coincidan con mis preferencias
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar perfil'}
              </button>
            </div>
          </form>

          <div className="mt-4 text-xs text-slate-500 text-center">
            Tus preferencias se utilizan para enviarte notificaciones de proyectos relevantes.
            No compartiremos tus datos con terceros.
          </div>
        </div>
      </div>
    </main>
  );
}