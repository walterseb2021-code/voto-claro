'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Project = {
  id: string;
  name: string;
  category: string;
  objective: string;
  district: string;
  department: string;
  pdf_url: string;
  status: string;
  created_at: string;
  beneficiary_count: number;
  requested_budget?: number | null;
  budget_category?: string | null;
  minimum_supports_required?: number | null;
  eligible_for_final_review?: boolean | null;
  evaluation_exists: boolean;
  leader: {
    full_name: string;
    alias: string;
    email: string;
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

function askScore(label: string, max: number): number | null {
  const value = prompt(`${label} (0-${max}):`);
  if (value == null) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    alert(`Debes ingresar un número válido entre 0 y ${max}.`);
    return null;
  }

  return parsed;
}

export default function AdminProyectosPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'active' | 'disqualified'>('pending');

  useEffect(() => {
    loadProjects();
  }, [filter]);

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
          district,
          department,
          pdf_url,
          status,
          created_at,
          beneficiary_count,
          requested_budget,
          budget_category,
          minimum_supports_required,
          eligible_for_final_review,
          leader:project_participants!leader_id (
            full_name,
            alias,
            email
          ),
          evaluation:project_evaluations (
            id
          )
        `)
        .eq('status', filter)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const transformed = (data || []).map((item: any) => ({
        ...item,
        leader: item.leader && item.leader.length > 0 ? item.leader[0] : null,
        evaluation_exists: item.evaluation && item.evaluation.length > 0,
      }));

      setProjects(transformed);
    } catch (err: any) {
      console.error('Error cargando proyectos:', err);
      setError(err.message || 'Error al cargar proyectos');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (projectId: string, newStatus: 'active' | 'disqualified') => {
    setMessage(null);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: newStatus })
        .eq('id', projectId);

      if (error) throw error;

      setMessage(`✅ Proyecto ${newStatus === 'active' ? 'aprobado' : 'rechazado'} correctamente`);
      loadProjects();
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`);
    }
  };

  const evaluateProject = async (project: Project) => {
    const minSupportsRequired = project.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED;
    const currentSupports = project.beneficiary_count || 0;

    if (currentSupports < minSupportsRequired) {
      alert(`Este proyecto todavía no puede evaluarse. Le faltan ${minSupportsRequired - currentSupports} apoyos.`);
      return;
    }

    const impact = askScore('Puntaje de impacto comunitario', 15);
    if (impact == null) return;

    const clarity = askScore('Puntaje de claridad del problema y la solución', 15);
    if (clarity == null) return;

    const viability = askScore('Puntaje de viabilidad técnica y presupuestal', 15);
    if (viability == null) return;

    const sustainability = askScore('Puntaje de sostenibilidad del beneficio', 15);
    if (sustainability == null) return;

    const confirmSave = confirm(
      '¿Confirmar evaluación? Una vez guardada no se podrá modificar.'
    );
    if (!confirmSave) return;

    try {
      const res = await fetch('/api/admin/proyectos/evaluar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          impact,
          clarity,
          viability,
          sustainability,
          confirm: 'yes',
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert('✅ Evaluación guardada correctamente');
        loadProjects();
      } else {
        alert('❌ ' + (data.error || 'Error al guardar evaluación'));
      }
    } catch (err: any) {
      alert('❌ Error al guardar evaluación');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Admin - Proyectos Ciudadanos</h1>
          <Link href="/admin" className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300">
            ← Volver al Admin
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-emerald-600 p-4 mb-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Modelo de evaluación vigente</h2>
          <div className="text-sm text-slate-700 space-y-1">
            <p>Un proyecto entra a evaluación final cuando alcanza al menos <strong>100 apoyos válidos</strong>.</p>
            <p>La nota final combina <strong>40 puntos por respaldo ciudadano</strong> y <strong>60 puntos por calidad del proyecto</strong>.</p>
            <p>La calidad se califica con cuatro criterios de hasta <strong>15 puntos</strong> cada uno: impacto comunitario, claridad del problema y la solución, viabilidad técnica y presupuestal, y sostenibilidad del beneficio.</p>
          </div>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border-2 border-red-600 p-4 mb-6 shadow-sm">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-xl font-semibold transition ${
                filter === 'pending'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-4 py-2 rounded-xl font-semibold transition ${
                filter === 'active'
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Activos
            </button>
            <button
              onClick={() => setFilter('disqualified')}
              className={`px-4 py-2 rounded-xl font-semibold transition ${
                filter === 'disqualified'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Rechazados
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-600">Cargando...</p>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 text-center">
            <p className="text-slate-600">
              No hay proyectos en estado <strong>{filter === 'pending' ? 'pendiente' : filter === 'active' ? 'activo' : 'rechazado'}</strong>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => {
              const minSupportsRequired = project.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED;
              const currentSupports = project.beneficiary_count || 0;
              const supportsRemaining = Math.max(minSupportsRequired - currentSupports, 0);
              const eligibleForFinalReview =
                project.eligible_for_final_review != null
                  ? Boolean(project.eligible_for_final_review)
                  : currentSupports >= minSupportsRequired;

              return (
                <div key={project.id} className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
                  <div className="flex justify-between items-start flex-wrap gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          {project.category}
                        </span>
                        <span className="text-xs text-slate-500">
                          {project.department} - {project.district}
                        </span>
                        <span className="text-xs font-semibold bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">
                          {getBudgetCategoryLabel(project.budget_category)}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold text-slate-900 mb-1">{project.name}</h2>
                      <p className="text-sm text-slate-600 mb-2 line-clamp-2">{project.objective}</p>

                      <div className="text-xs text-slate-500">
                        <span className="font-semibold">Líder:</span> {project.leader?.full_name || 'Anónimo'} (@{project.leader?.alias})
                      </div>
                      <div className="text-xs text-slate-500">
                        📅 {new Date(project.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        🤝 Apoyos: {currentSupports} / {minSupportsRequired}
                      </div>
                      <div className="text-xs text-slate-500">
                        💰 Monto solicitado: {getRequestedBudgetLabel(project.requested_budget)}
                      </div>
                      <div className="text-xs text-slate-500">
                        🏁 Elegibilidad final: {eligibleForFinalReview ? 'Sí' : 'No'}
                      </div>

                      {project.pdf_url && (
                        <a
                          href={project.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-2 text-xs text-green-700 hover:underline"
                        >
                          📄 Ver PDF
                        </a>
                      )}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {filter === 'active' ? (
                        <>
                          {project.evaluation_exists ? (
                            <span className="text-xs bg-green-100 text-green-800 px-3 py-2 rounded-xl font-semibold">
                              ✅ Evaluado
                            </span>
                          ) : eligibleForFinalReview ? (
                            <button
                              onClick={() => evaluateProject(project)}
                              className="bg-purple-600 text-white px-3 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700"
                            >
                              📊 Evaluar
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-xl">
                              ⏳ Faltan {supportsRemaining} apoyos
                            </span>
                          )}

                          <Link
                            href={`/proyecto-ciudadano/proyectos/${project.id}`}
                            className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300"
                          >
                            Ver detalles
                          </Link>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => updateStatus(project.id, 'active')}
                            className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700"
                          >
                            ✅ Aprobar
                          </button>
                          <button
                            onClick={() => updateStatus(project.id, 'disqualified')}
                            className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-700"
                          >
                            ❌ Rechazar
                          </button>
                          <Link
                            href={`/proyecto-ciudadano/proyectos/${project.id}`}
                            className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300"
                          >
                            Ver detalles
                          </Link>
                        </>
                      )}
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