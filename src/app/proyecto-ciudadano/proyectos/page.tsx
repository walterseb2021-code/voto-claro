'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

type Project = {
  id: string;
  name: string;
  category: string;
  objective: string;
  description: string;
  district: string;
  department: string;
  pdf_url: string;
  leader_id: string;
  beneficiary_count: number;
  created_at: string;
  requested_budget?: number | null;
  budget_category?: string | null;
  minimum_supports_required?: number | null;
  eligible_for_final_review?: boolean | null;
  leader: {
    alias: string;
    full_name: string;
  } | null;
};

const DEFAULT_MIN_SUPPORTS_REQUIRED = 100;

function getBudgetCategoryLabel(category: string | null | undefined): string {
  if (category === 'hasta_10000') return 'Hasta S/10,000';
  if (category === 'hasta_20000') return 'Hasta S/20,000';
  if (category === 'hasta_30000') return 'Hasta S/30,000';
  return 'Sin categoría presupuestal';
}

function getRequestedBudgetLabel(value: number | null | undefined): string {
  if (value == null) return 'No especificado';
  return `S/${Number(value).toLocaleString('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function ProyectosActivosPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const departments = [
    'todos', 'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho',
    'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica',
    'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios',
    'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'
  ];

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          category,
          objective,
          description,
          district,
          department,
          pdf_url,
          leader_id,
          beneficiary_count,
          created_at,
          requested_budget,
          budget_category,
          minimum_supports_required,
          eligible_for_final_review,
          leader:project_participants!leader_id (
            alias,
            full_name
          )
        `)
        .eq('status', 'active')
        .order('beneficiary_count', { ascending: false });

      if (error) throw error;

      const transformedProjects: Project[] = (data || []).map((item: any) => ({
        ...item,
        leader: item.leader && item.leader.length > 0 ? item.leader[0] : null,
      }));

      setProjects(transformedProjects);
    } catch (err: any) {
      console.error('Error cargando proyectos:', err);
      setError(err.message || 'Error al cargar los proyectos');
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(project => {
    const matchesDepartment = selectedDepartment === 'todos' || project.department === selectedDepartment;
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.district.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesDepartment && matchesSearch;
  });

  useEffect(() => {
    const visibleTitles = filteredProjects.slice(0, 8).map((project) => project.name).filter(Boolean);
    const highlightedProject = filteredProjects[0] || null;
    const hasSearch = searchTerm.trim().length > 0;
    const selectedDepartmentLabel =
      selectedDepartment === 'todos' ? 'Todos los departamentos' : selectedDepartment;

    const activeSection = loading
      ? 'proyectos-cargando'
      : error
      ? 'proyectos-con-error'
      : filteredProjects.length === 0
      ? 'proyectos-sin-resultados'
      : 'proyectos-listado';

    const activeViewId = loading
      ? 'loading'
      : error
      ? 'error'
      : filteredProjects.length === 0
      ? 'empty'
      : 'results';

    const activeViewTitle = loading
      ? 'Cargando proyectos activos'
      : error
      ? 'Error al cargar proyectos'
      : filteredProjects.length === 0
      ? 'Sin proyectos visibles'
      : 'Listado de proyectos activos';

    const visibleParts: string[] = [];

    if (loading) {
      visibleParts.push('La lista de proyectos activos está cargando.');
    }

    if (error) {
      visibleParts.push(`Error visible al cargar proyectos: ${error}.`);
    }

    visibleParts.push(`Filtro de departamento visible: ${selectedDepartmentLabel}.`);

    if (hasSearch) {
      visibleParts.push(`Búsqueda visible: ${searchTerm.trim()}.`);
    } else {
      visibleParts.push('No hay texto de búsqueda escrito.');
    }

    visibleParts.push(`Cantidad total de proyectos cargados: ${projects.length}.`);
    visibleParts.push(`Cantidad de proyectos visibles con los filtros actuales: ${filteredProjects.length}.`);

    if (highlightedProject) {
      const minSupports = highlightedProject.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED;
      const currentSupports = highlightedProject.beneficiary_count || 0;
      const supportsRemaining = Math.max(minSupports - currentSupports, 0);
      const eligible =
        highlightedProject.eligible_for_final_review != null
          ? Boolean(highlightedProject.eligible_for_final_review)
          : currentSupports >= minSupports;

      visibleParts.push(`Primer proyecto visible: ${highlightedProject.name}.`);
      visibleParts.push(`Categoría temática visible del primer proyecto: ${highlightedProject.category}.`);
      visibleParts.push(`Departamento visible del primer proyecto: ${highlightedProject.department}.`);
      visibleParts.push(`Distrito visible del primer proyecto: ${highlightedProject.district}.`);
      visibleParts.push(`Monto solicitado visible del primer proyecto: ${getRequestedBudgetLabel(highlightedProject.requested_budget)}.`);
      visibleParts.push(`Categoría presupuestal visible del primer proyecto: ${getBudgetCategoryLabel(highlightedProject.budget_category)}.`);
      visibleParts.push(`Apoyos visibles del primer proyecto: ${currentSupports}.`);
      visibleParts.push(`Apoyos faltantes del primer proyecto para evaluación final: ${supportsRemaining}.`);
      visibleParts.push(
        eligible
          ? 'El primer proyecto visible ya es elegible para evaluación final.'
          : 'El primer proyecto visible todavía no es elegible para evaluación final.'
      );
    }

    if (visibleTitles.length) {
      visibleParts.push(`Títulos visibles: ${visibleTitles.join(', ')}.`);
    }

    visibleParts.push(`Regla visible del programa: cada proyecto necesita al menos ${DEFAULT_MIN_SUPPORTS_REQUIRED} apoyos válidos para entrar a evaluación final.`);

    if (!loading && !error && filteredProjects.length === 0) {
      if (selectedDepartment !== 'todos') {
        visibleParts.push(`No hay proyectos visibles para el departamento de ${selectedDepartment}.`);
      } else {
        visibleParts.push('No hay proyectos activos visibles en este momento.');
      }
    }

    const availableActions = [
      'Volver',
      'Cambiar departamento',
      'Buscar proyecto',
      filteredProjects.length === 0 ? 'Presentar proyecto' : null,
      filteredProjects.length > 0 ? 'Ver detalles' : null,
    ].filter(Boolean) as string[];

    const suggestedPrompts = loading
      ? [
          {
            id: 'pc-proyectos-1',
            label: '¿Qué está cargando?',
            question: '¿Qué está cargando en esta pantalla de proyectos?',
          },
        ]
      : error
      ? [
          {
            id: 'pc-proyectos-1',
            label: '¿Qué error se ve?',
            question: '¿Qué error se muestra ahora en esta pantalla?',
          },
          {
            id: 'pc-proyectos-2',
            label: '¿Qué puedo hacer aquí?',
            question: '¿Qué puedo hacer en esta pantalla aunque haya error?',
          },
        ]
      : filteredProjects.length === 0
      ? [
          {
            id: 'pc-proyectos-1',
            label: '¿Qué filtro tengo?',
            question: '¿Qué filtro de departamento está aplicado ahora?',
          },
          {
            id: 'pc-proyectos-2',
            label: '¿Hay búsqueda activa?',
            question: '¿Hay alguna búsqueda activa en esta pantalla?',
          },
          {
            id: 'pc-proyectos-3',
            label: '¿Por qué no veo proyectos?',
            question: '¿Por qué no se están viendo proyectos en esta pantalla?',
          },
          {
            id: 'pc-proyectos-4',
            label: '¿Dónde presento uno?',
            question: '¿Dónde puedo presentar un proyecto desde esta pantalla?',
          },
        ]
      : [
          {
            id: 'pc-proyectos-1',
            label: '¿Qué filtro tengo?',
            question: '¿Qué filtro de departamento está aplicado en esta pantalla?',
          },
          {
            id: 'pc-proyectos-2',
            label: '¿Hay búsqueda activa?',
            question: '¿Hay una búsqueda activa en esta pantalla?',
          },
          {
            id: 'pc-proyectos-3',
            label: '¿Cuántos proyectos veo?',
            question: '¿Cuántos proyectos se están viendo ahora con los filtros actuales?',
          },
          {
            id: 'pc-proyectos-4',
            label: '¿Qué categoría presupuestal tiene el primero?',
            question: '¿Qué categoría presupuestal y qué monto tiene el primer proyecto visible?',
          },
          {
            id: 'pc-proyectos-5',
            label: '¿Ya es elegible el primero?',
            question: '¿El primer proyecto visible ya es elegible para evaluación final?',
          },
        ];

    const summary = loading
      ? 'Pantalla de proyectos ciudadanos cargando la lista de proyectos activos.'
      : error
      ? 'Pantalla de proyectos ciudadanos con error visible al cargar la lista.'
      : filteredProjects.length === 0
      ? 'Pantalla de proyectos ciudadanos sin resultados visibles con los filtros actuales.'
      : 'Pantalla de proyectos ciudadanos con filtros, búsqueda, apoyos visibles, categoría presupuestal y elegibilidad para evaluación final.';

    setPageContext({
      pageId: 'proyecto-ciudadano-proyectos',
      pageTitle: 'Proyectos Ciudadanos Activos',
      route: '/proyecto-ciudadano/proyectos',
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Proyecto Ciudadano', 'Proyectos', activeViewTitle],
      visibleSections: [
        'cabecera',
        'descripcion',
        'filtros',
        loading ? 'estado-carga' : error ? 'estado-error' : filteredProjects.length === 0 ? 'estado-vacio' : 'listado-proyectos',
      ],
      visibleActions: availableActions,
      availableActions,
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: highlightedProject?.name || undefined,
      status: loading ? 'loading' : error ? 'error' : 'ready',
      resultsSummary: loading
        ? 'La lista de proyectos sigue cargando.'
        : error
        ? 'Hay un error visible al cargar los proyectos.'
        : `Se muestran ${filteredProjects.length} proyectos con los filtros actuales.`,
      suggestedPrompts,
      dynamicData: {
        loading,
        error: error || null,
        totalProjects: projects.length,
        visibleProjects: filteredProjects.length,
        selectedDepartment,
        selectedDepartmentLabel,
        searchTerm: searchTerm.trim() || null,
        searchActive: hasSearch,
        minimumSupportsRequired: DEFAULT_MIN_SUPPORTS_REQUIRED,
        visibleProjectTitles: visibleTitles,
        highlightedProject: highlightedProject
          ? {
              id: highlightedProject.id,
              name: highlightedProject.name,
              category: highlightedProject.category,
              department: highlightedProject.department,
              district: highlightedProject.district,
              beneficiary_count: highlightedProject.beneficiary_count || 0,
              requested_budget: highlightedProject.requested_budget ?? null,
              budget_category: highlightedProject.budget_category || null,
              budget_category_label: getBudgetCategoryLabel(highlightedProject.budget_category),
              minimum_supports_required:
                highlightedProject.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED,
              eligible_for_final_review:
                highlightedProject.eligible_for_final_review != null
                  ? Boolean(highlightedProject.eligible_for_final_review)
                  : (highlightedProject.beneficiary_count || 0) >=
                    (highlightedProject.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED),
            }
          : null,
      },
      contextVersion: 'pc-proyectos-v2',
    });
  }, [setPageContext, projects, filteredProjects, loading, error, selectedDepartment, searchTerm]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Proyectos Ciudadanos Activos</h1>
          <Link href="/proyecto-ciudadano" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 mb-6 shadow-sm">
          <p className="text-slate-700">
            Estos son los proyectos ciudadanos que han sido aprobados y están recibiendo apoyo vecinal.
            Cada proyecto necesita al menos <strong>100 apoyos válidos</strong> para entrar a evaluación final.
          </p>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Departamento</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept === 'todos' ? 'Todos los departamentos' : dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Buscar por nombre, categoría o distrito</label>
              <input
                type="text"
                placeholder="Ej: Árboles, Educación, Salud..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Cargando proyectos...</p>
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4">
            {error}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 text-center">
            <p className="text-slate-600">No hay proyectos activos en este momento.</p>
            <p className="text-slate-500 text-sm mt-2">
              {selectedDepartment !== 'todos'
                ? `No hay proyectos para el departamento de ${selectedDepartment}.`
                : 'Sé el primero en presentar un proyecto ciudadano.'}
            </p>
            <Link
              href="/proyecto-ciudadano/nuevo-proyecto"
              className="inline-block mt-4 bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800"
            >
              Presentar proyecto
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => {
              const minSupports = project.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED;
              const currentSupports = project.beneficiary_count || 0;
              const supportsRemaining = Math.max(minSupports - currentSupports, 0);
              const eligible =
                project.eligible_for_final_review != null
                  ? Boolean(project.eligible_for_final_review)
                  : currentSupports >= minSupports;

              return (
                <div
                  key={project.id}
                  className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3 gap-2 flex-wrap">
                      <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        {project.category}
                      </span>
                      <span className="text-xs text-slate-500">
                        {project.department}
                      </span>
                    </div>

                    <div className="flex gap-2 flex-wrap mb-3">
                      <span className="text-xs font-semibold bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">
                        {getBudgetCategoryLabel(project.budget_category)}
                      </span>
                      <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-1 rounded-full">
                        {getRequestedBudgetLabel(project.requested_budget)}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2">
                      {project.name}
                    </h2>

                    <p className="text-sm text-slate-600 mb-3 line-clamp-3">
                      {project.objective}
                    </p>

                    <div className="text-xs text-slate-500 mb-2">
                      📍 {project.district} | 👤 {project.leader?.alias || project.leader?.full_name?.split(' ')[0] || 'Anónimo'}
                    </div>

                    <div className="text-xs text-slate-500 mb-3">
                      🤝 {currentSupports} / {minSupports} apoyos
                    </div>

                    <div className={`text-xs font-semibold rounded-lg px-3 py-2 mb-4 ${
                      eligible
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {eligible
                        ? '✅ Elegible para evaluación final'
                        : `⏳ Faltan ${supportsRemaining} apoyos`}
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm font-semibold text-slate-700">
                        Ver más
                      </div>
                      <Link
                        href={`/proyecto-ciudadano/proyectos/${project.id}`}
                        className="text-sm font-semibold text-green-700 hover:text-green-800"
                      >
                        Ver detalles →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}