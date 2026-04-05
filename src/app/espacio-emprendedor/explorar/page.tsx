'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

type Project = {
  id: string;
  title: string;
  category: string;
  department: string;
  district: string;
  summary: string;
  investment_min: number | null;
  investment_max: number | null;
  pdf_url: string;
  views: number;
  created_at: string;
};

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

export default function ExplorarProyectosPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedDepartment, setSelectedDepartment] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [participant, setParticipant] = useState<any>(null);

  useEffect(() => {
    cargarParticipante();
    cargarProyectos();
  }, []);

  const cargarParticipante = async () => {
    const deviceId = localStorage.getItem('vc_device_id');
    if (deviceId) {
      const { data } = await supabase
        .from('project_participants')
        .select('id, alias, full_name')
        .eq('device_id', deviceId)
        .maybeSingle();

      setParticipant(data);
    }
  };

  const cargarProyectos = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('espacio_proyectos')
        .select(`
          id,
          title,
          category,
          department,
          district,
          summary,
          investment_min,
          investment_max,
          pdf_url,
          views,
          created_at
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProjects(data || []);
    } catch (err: any) {
      console.error('Error cargando proyectos:', err);
      setError(err.message || 'Error al cargar proyectos');
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter((project) => {
    const matchesCategory =
      selectedCategory === 'Todas' || project.category === selectedCategory;

    const matchesDepartment =
      selectedDepartment === 'Todos' || project.department === selectedDepartment;

    const matchesSearch =
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.summary.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesCategory && matchesDepartment && matchesSearch;
  });

   const formatInvestment = (min: number | null, max: number | null) => {
  if (min && max) return `S/ ${min.toLocaleString()} - S/ ${max.toLocaleString()}`;
  if (min) return `Desde S/ ${min.toLocaleString()}`;
  if (max) return `Hasta S/ ${max.toLocaleString()}`;
  return 'No especificado';
};

const goToPath = (path: string) => {
  window.location.href = path;
};

      useEffect(() => {
    const visibleTitles = filteredProjects
      .slice(0, 5)
      .map((p) => p.title)
      .filter(Boolean);

    const normalizedSearch = searchTerm.trim();

    const hasCategoryFilter = selectedCategory !== 'Todas';
    const hasDepartmentFilter = selectedDepartment !== 'Todos';
    const hasSearchFilter = normalizedSearch.length > 0;

    const hasActiveFilters =
      hasCategoryFilter || hasDepartmentFilter || hasSearchFilter;

    const activeSection = loading
      ? 'explorar-cargando'
      : error
      ? 'explorar-error'
      : filteredProjects.length === 0
      ? 'explorar-sin-resultados'
      : 'explorar-resultados';

    const activeViewId = loading
      ? 'loading-results'
      : error
      ? 'error-results'
      : filteredProjects.length === 0
      ? 'empty-results'
      : 'project-results';

    const activeViewTitle = loading
      ? 'Explorar proyectos cargando'
      : error
      ? 'Explorar proyectos con error'
      : filteredProjects.length === 0
      ? 'Sin resultados visibles'
      : 'Resultados de proyectos';

    const visibleParts: string[] = [];
    visibleParts.push(`Vista activa: ${activeViewTitle}.`);
    visibleParts.push('Pantalla visible: Explorar proyectos del Espacio Emprendedor.');

    if (loading) {
      visibleParts.push('La pantalla está cargando proyectos emprendedores para explorar.');
    }

    if (!loading && !error) {
      visibleParts.push(`Proyectos cargados en esta pantalla: ${projects.length}.`);
      visibleParts.push(`Proyectos visibles con los filtros actuales: ${filteredProjects.length}.`);
    }

    if (participant) {
      visibleParts.push(
        `Hay un participante con sesión activa: ${participant.full_name || participant.alias || 'participante'}.`
      );
    } else if (!loading) {
      visibleParts.push('No hay participante con sesión activa visible en esta pantalla.');
    }

    if (hasCategoryFilter) {
      visibleParts.push(`Categoría seleccionada: ${selectedCategory}.`);
    } else {
      visibleParts.push('No hay categoría específica seleccionada.');
    }

    if (hasDepartmentFilter) {
      visibleParts.push(`Departamento seleccionado: ${selectedDepartment}.`);
    } else {
      visibleParts.push('No hay departamento específico seleccionado.');
    }

    if (hasSearchFilter) {
      visibleParts.push(`Texto de búsqueda visible: ${normalizedSearch}.`);
    } else {
      visibleParts.push('No hay texto de búsqueda activo.');
    }

    if (visibleTitles.length) {
      visibleParts.push(`Proyectos visibles en pantalla: ${visibleTitles.join(', ')}.`);
    }

    if (!loading && !error && filteredProjects.length === 0) {
      visibleParts.push('No hay proyectos visibles que coincidan con los filtros actuales.');
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}`);
    }

    const availableActions = [
      'Cambiar categoría',
      'Cambiar departamento',
      'Buscar por título',
      filteredProjects.length > 0 ? 'Ver detalles' : null,
      hasActiveFilters ? 'Limpiar filtros' : null,
      'Volver',
    ].filter(Boolean) as string[];

    const summary = loading
      ? 'Pantalla de exploración de proyectos emprendedores cargando resultados.'
      : error
      ? 'Pantalla de exploración de proyectos con error de carga.'
      : filteredProjects.length === 0
      ? 'Pantalla de exploración sin resultados visibles para los filtros actuales.'
      : 'Pantalla de exploración de proyectos emprendedores con filtros y tarjetas de proyectos visibles.';

    const status = loading ? 'loading' : error ? 'error' : 'ready';

          setPageContext({
      pageId: 'espacio-emprendedor-explorar',
      pageTitle: 'Espacio Emprendedor',
      route: '/espacio-emprendedor/explorar',
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Espacio Emprendedor', 'Explorar proyectos', activeViewTitle],
      visibleSections: ['filtros', 'busqueda', 'resultados'],
      suggestedPrompts: [
        {
          id: 'ee-explore-1',
          label: '¿Qué filtros tengo aplicados?',
          question: '¿Qué filtros tengo aplicados en esta pantalla?',
        },
        {
          id: 'ee-explore-2',
          label: '¿Cuántos proyectos veo?',
          question: '¿Cuántos proyectos estoy viendo en esta pantalla?',
        },
        {
          id: 'ee-explore-3',
          label: '¿Qué categoría está seleccionada?',
          question: '¿Qué categoría está seleccionada en esta pantalla?',
        },
        {
          id: 'ee-explore-4',
          label: '¿Qué departamento está seleccionado?',
          question: '¿Qué departamento está seleccionado en esta pantalla?',
        },
        {
          id: 'ee-explore-5',
          label: '¿Hay búsqueda activa?',
          question: '¿Hay una búsqueda activa en esta pantalla?',
        },
      ],
      visibleActions: availableActions,
      visibleText: visibleParts.join('\n'),
      availableActions,
      selectedCategory: hasCategoryFilter ? selectedCategory : undefined,
      selectedItemTitle: filteredProjects[0]?.title || undefined,
      status,
      dynamicData: {
        participantLogueado: !!participant,
        projectsCount: projects.length,
        filteredProjectsCount: filteredProjects.length,
        visibleProjectTitles: visibleTitles,
        selectedCategory,
        selectedDepartment,
        searchTerm: normalizedSearch,
        hasCategoryFilter,
        hasDepartmentFilter,
        hasSearchFilter,
        hasActiveFilters,
        emptyResults: !loading && !error && filteredProjects.length === 0,
        firstProjectTitle: filteredProjects[0]?.title || '',
        canOpenProjectDetail: filteredProjects.length > 0,
        canFilterByCategory: true,
        canFilterByDepartment: true,
        canSearchProjects: true,
      },
    });
  }, [
    setPageContext,
    loading,
    error,
    projects,
    filteredProjects,
    participant,
    selectedCategory,
    selectedDepartment,
    searchTerm,
  ]);
  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Explorar proyectos emprendedores</h1>
            <button
            type="button"
            onClick={() => goToPath('/espacio-emprendedor')}
            className="vc-ee-explorar-link text-sm text-slate-600 hover:underline cursor-pointer"
            >
           ← Volver
          </button>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Categoría</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                {CATEGORIAS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Departamento</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                {DEPARTAMENTOS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Buscar por título</label>
              <input
                type="text"
                placeholder="Ej: app, construcción, turismo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-600 text-center py-12">Cargando proyectos...</p>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4">
            {error}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 text-center">
            <p className="text-slate-600">
              No hay proyectos que coincidan con los filtros seleccionados.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('Todas');
                setSelectedDepartment('Todos');
                setSearchTerm('');
              }}
              className="mt-3 text-green-700 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <div
                
              key={project.id}
  className="vc-ee-explorar-card bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden"
>
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-semibold bg-gradient-to-r from-green-600 to-green-700 text-black px-3 py-1 rounded-full shadow-sm">
                      {project.category}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-800 mb-2 line-clamp-2 hover:text-green-700 transition">
                    {project.title}
                  </h2>

                  <p className="text-sm text-slate-600 mb-4 line-clamp-3">{project.summary}</p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {project.district}, {project.department}
                    </span>
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">
                      💰 {formatInvestment(project.investment_min, project.investment_max)}
                    </span>
                  </div>

                  <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
                     <button
                     type="button"
                     onClick={() => goToPath(`/espacio-emprendedor/proyectos/${project.id}`)}
                     className="vc-ee-explorar-link bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm cursor-pointer"
                     >
                      Ver detalles
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}