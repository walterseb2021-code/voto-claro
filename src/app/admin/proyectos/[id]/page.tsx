'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Leader = {
  full_name: string | null;
  alias: string | null;
  email: string | null;
};

type Project = {
  id: string;
  name: string;
  category: string | null;
  objective: string | null;
  description: string | null;
  district: string | null;
  department: string | null;
  pdf_url: string | null;
  status: string | null;
  created_at: string | null;
  beneficiary_count: number | null;
  requested_budget?: number | null;
  budget_category?: string | null;
  minimum_supports_required?: number | null;
  eligible_for_final_review?: boolean | null;
  leader: Leader | null;
};

function getBudgetCategoryLabel(category: string | null | undefined) {
  const labels: Record<string, string> = {
    hasta_10000: 'Hasta S/10,000',
    hasta_20000: 'Hasta S/20,000',
    hasta_30000: 'Hasta S/30,000',
  };

  return category ? labels[category] || category : 'Sin categoria';
}

function getRequestedBudgetLabel(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return 'No informado';
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No disponible';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function normalizeLeader(leader: Leader | Leader[] | null | undefined) {
  if (Array.isArray(leader)) return leader[0] ?? null;
  return leader ?? null;
}

export default function AdminProyectoDetallePage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) {
        setError('Proyecto no encontrado.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
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
          )
        `)
        .eq('id', projectId)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setProject(null);
      } else if (!data) {
        setError('Proyecto no encontrado.');
        setProject(null);
      } else {
        const row = data as Omit<Project, 'leader'> & {
          leader?: Leader | Leader[] | null;
        };
        setProject({
          ...row,
          leader: normalizeLeader(row.leader),
        });
      }

      setLoading(false);
    };

    loadProject();
  }, [projectId]);

  const supportGoal = project?.minimum_supports_required || 100;
  const currentSupports = project?.beneficiary_count || 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/admin/proyectos"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Volver a proyectos
          </Link>
        </div>

        {loading && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600">
            Cargando proyecto...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
            {error}
          </div>
        )}

        {!loading && project && (
          <div className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                    Detalle admin
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-900">
                    {project.name}
                  </h1>
                  <p className="mt-2 text-slate-600">
                    {project.department || 'Sin departamento'} / {project.district || 'Sin distrito'}
                  </p>
                </div>

                <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {project.status || 'Sin estado'}
                </span>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Datos principales</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Categoria</dt>
                    <dd className="text-right font-medium text-slate-900">{project.category || 'Sin categoria'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Monto solicitado</dt>
                    <dd className="text-right font-medium text-slate-900">{getRequestedBudgetLabel(project.requested_budget)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Rango</dt>
                    <dd className="text-right font-medium text-slate-900">{getBudgetCategoryLabel(project.budget_category)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Apoyos</dt>
                    <dd className="text-right font-medium text-slate-900">{currentSupports} / {supportGoal}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Creado</dt>
                    <dd className="text-right font-medium text-slate-900">{formatDate(project.created_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Revision final</dt>
                    <dd className="text-right font-medium text-slate-900">
                      {project.eligible_for_final_review ? 'Elegible' : 'No elegible'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Lider</h2>
                {project.leader ? (
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-slate-500">Nombre</dt>
                      <dd className="font-medium text-slate-900">{project.leader.full_name || 'Sin nombre'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Alias</dt>
                      <dd className="font-medium text-slate-900">{project.leader.alias || 'Sin alias'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Email</dt>
                      <dd className="break-all font-medium text-slate-900">{project.leader.email || 'Sin email'}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-slate-600">No hay lider asociado.</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Objetivo</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {project.objective || 'No especificada.'}
              </p>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Descripcion</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {project.description || 'No especificada.'}
              </p>
            </section>

            {project.pdf_url && (
              <section className="rounded-lg border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-900">Documento PDF</h2>
                <a
                  href={project.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Ver PDF
                </a>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
