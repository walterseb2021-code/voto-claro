'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

const CATEGORIAS = [
  'Todas',
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
  'Todos',
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

export default function PerfilInversionistaPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

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
    monto_mayor: false,
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

      const { data: perfilData } = await supabase
        .from('espacio_inversionistas')
        .select('*')
        .eq('participant_id', participantData.id)
        .maybeSingle();

      if (perfilData) {
        setPerfil({
          company: perfilData.company || '',
          investment_range_min: perfilData.investment_range_min?.toString() || '',
          investment_range_max:
            perfilData.investment_range_max && perfilData.investment_range_max <= 100000
              ? perfilData.investment_range_max.toString()
              : '',
          categories: perfilData.categories || [],
          departments: perfilData.departments || [],
          notify_email: perfilData.notify_email || false,
          monto_mayor: (perfilData.investment_range_max || 0) > 100000,
        });
      }
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    if (category === 'Todas') {
      const todas = CATEGORIAS.filter((c) => c !== 'Todas');
      setPerfil((prev) => ({
        ...prev,
        categories: prev.categories.length === todas.length ? [] : todas,
      }));
    } else {
      setPerfil((prev) => ({
        ...prev,
        categories: prev.categories.includes(category)
          ? prev.categories.filter((c) => c !== category)
          : [...prev.categories, category],
      }));
    }
  };

  const toggleDepartment = (department: string) => {
    if (department === 'Todos') {
      const todos = DEPARTAMENTOS.filter((d) => d !== 'Todos');
      setPerfil((prev) => ({
        ...prev,
        departments: prev.departments.length === todos.length ? [] : todos,
      }));
    } else {
      setPerfil((prev) => ({
        ...prev,
        departments: prev.departments.includes(department)
          ? prev.departments.filter((d) => d !== department)
          : [...prev.departments, department],
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    let maxValue = null;
    if (perfil.monto_mayor) {
      maxValue = 999999;
    } else if (perfil.investment_range_max) {
      maxValue = parseInt(perfil.investment_range_max);
    }

    try {
      const { error } = await supabase
        .from('espacio_inversionistas')
        .upsert({
          participant_id: participant.id,
          company: perfil.company || null,
          investment_range_min: perfil.investment_range_min
            ? parseInt(perfil.investment_range_min)
            : null,
          investment_range_max: maxValue,
          categories: perfil.categories,
          departments: perfil.departments,
          notify_email: perfil.notify_email,
        });

      if (error) throw error;

      setMessage(
        '✅ Perfil guardado correctamente. Recibirás notificaciones de proyectos que coincidan con tus intereses.'
      );
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error('Error guardando perfil:', err);
      setError(err.message || 'Error al guardar perfil');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const visibleParts: string[] = [];

    if (loading) {
      visibleParts.push('La pantalla está cargando el perfil del inversionista.');
    }

    if (participant && !loading) {
      visibleParts.push(
        `Participante con sesión activa: ${participant.full_name || participant.alias || 'participante'}.`
      );
    }

    if (!participant && !loading) {
      visibleParts.push('No hay participante válido cargado en esta pantalla.');
    }

    if (perfil.company.trim()) {
      visibleParts.push(`Empresa u organización visible: ${perfil.company.trim()}.`);
    }

    if (perfil.investment_range_min) {
      visibleParts.push(`Monto mínimo visible: S/ ${perfil.investment_range_min}.`);
    }

    if (perfil.monto_mayor) {
      visibleParts.push('Está marcada la opción de montos mayores a S/ 100000.');
    } else if (perfil.investment_range_max) {
      visibleParts.push(`Monto máximo visible: S/ ${perfil.investment_range_max}.`);
    }

    if (perfil.categories.length) {
      visibleParts.push(`Categorías seleccionadas: ${perfil.categories.join(', ')}.`);
    } else {
      visibleParts.push('No hay categorías seleccionadas todavía.');
    }

    if (perfil.departments.length) {
      visibleParts.push(`Departamentos seleccionados: ${perfil.departments.join(', ')}.`);
    } else {
      visibleParts.push('No hay departamentos seleccionados todavía.');
    }

    visibleParts.push(
      perfil.notify_email
        ? 'Las notificaciones por correo están activadas.'
        : 'Las notificaciones por correo están desactivadas.'
    );

    if (saving) {
      visibleParts.push('El perfil del inversionista se está guardando.');
    }

    if (message) {
      visibleParts.push(`Mensaje de éxito visible: ${message}`);
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}`);
    }

    const availableActions = [
      'Guardar perfil',
      'Cambiar empresa',
      'Cambiar rango de inversión',
      'Seleccionar categorías',
      'Seleccionar departamentos',
      'Activar o desactivar notificaciones',
      'Volver',
    ];

    const summary = loading
      ? 'Pantalla del perfil inversionista cargando datos.'
      : error
      ? 'Pantalla del perfil inversionista con error visible.'
      : 'Pantalla para configurar preferencias del inversionista y recibir proyectos compatibles.';

    const status = loading ? 'loading' : error ? 'error' : 'ready';

    setPageContext({
      pageId: 'espacio-emprendedor',
      pageTitle: 'Espacio Emprendedor',
      route: '/espacio-emprendedor/perfil-inversionista',
      summary,
      activeSection: 'perfil-inversionista',
      visibleText: visibleParts.join('\n'),
      availableActions,
      selectedItemTitle:
        participant?.full_name || participant?.alias || perfil.company || undefined,
      status,
      dynamicData: {
        participantLogueado: !!participant,
        savingProfile: saving,
        company: perfil.company.trim(),
        investmentRangeMin: perfil.investment_range_min,
        investmentRangeMax: perfil.monto_mayor ? 'mayor-a-100000' : perfil.investment_range_max,
        montoMayor: perfil.monto_mayor,
        categoriesCount: perfil.categories.length,
        departmentsCount: perfil.departments.length,
        categoriesSelected: perfil.categories,
        departmentsSelected: perfil.departments,
        notifyEmail: perfil.notify_email,
      },
    });
  }, [setPageContext, loading, saving, message, error, participant, perfil]);

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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Empresa / Organización (opcional)
              </label>
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Inversión mínima (S/)
                </label>
                <input
                  type="number"
                  value={perfil.investment_range_min}
                  onChange={(e) =>
                    setPerfil({ ...perfil, investment_range_min: e.target.value })
                  }
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
                  value={perfil.investment_range_max}
                  onChange={(e) =>
                    setPerfil({ ...perfil, investment_range_max: e.target.value })
                  }
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 100000"
                  max={100000}
                  disabled={perfil.monto_mayor}
                />
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="monto_mayor"
                    checked={perfil.monto_mayor}
                    onChange={(e) =>
                      setPerfil({
                        ...perfil,
                        monto_mayor: e.target.checked,
                        investment_range_max: e.target.checked ? '' : perfil.investment_range_max,
                      })
                    }
                  />
                  <label htmlFor="monto_mayor" className="text-sm text-slate-600">
                    Busco proyectos con montos mayores a S/ 100000
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Categorías de interés
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map((category) => {
                  const active =
                    category === 'Todas'
                      ? perfil.categories.length === CATEGORIAS.filter((c) => c !== 'Todas').length
                      : perfil.categories.includes(category);

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                        active
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-green-500'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Departamentos de interés
              </label>
              <div className="flex flex-wrap gap-2">
                {DEPARTAMENTOS.map((department) => {
                  const active =
                    department === 'Todos'
                      ? perfil.departments.length ===
                        DEPARTAMENTOS.filter((d) => d !== 'Todos').length
                      : perfil.departments.includes(department);

                  return (
                    <button
                      key={department}
                      type="button"
                      onClick={() => toggleDepartment(department)}
                      className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                        active
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
                      }`}
                    >
                      {department}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify_email"
                checked={perfil.notify_email}
                onChange={(e) =>
                  setPerfil({ ...perfil, notify_email: e.target.checked })
                }
              />
              <label htmlFor="notify_email" className="text-sm text-slate-700">
                Recibir notificaciones por correo cuando aparezcan proyectos compatibles
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-green-700 text-white px-5 py-3 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar perfil'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}