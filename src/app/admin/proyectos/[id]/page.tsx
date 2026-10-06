'use client';

import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminNavActions from "@/components/admin/AdminNavActions";
import AdminButton from "@/components/admin/AdminButton";
import AdminCard from "@/components/admin/AdminCard";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

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

  return category ? labels[category] || category : 'Sin categoría';
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

function getMinimumSupports(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function getSupportCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
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

      try {
        const response = await fetch(
          `/api/admin/proyectos/${encodeURIComponent(projectId)}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          }
        );

        const result = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          window.location.assign('/admin/login');
          return;
        }

        if (response.status === 404) {
          setError('Proyecto no encontrado.');
          setProject(null);
          return;
        }

        if (!response.ok || !result?.ok || !result.project) {
          throw new Error('No se pudo cargar el proyecto.');
        }

        setProject(result.project as Project);
      } catch (err) {
        console.error('Error cargando proyecto admin:', err);
        setError('No se pudo cargar el proyecto.');
        setProject(null);
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId]);

  const supportGoal = getMinimumSupports(project?.minimum_supports_required);
  const currentSupports = getSupportCount(project?.beneficiary_count);

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function onLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setLogoutError("No se pudo cerrar la sesion.");
        return;
      }
      window.location.href = "/admin/login";
    } catch {
      setLogoutError("No se pudo cerrar la sesion.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <AdminPageShell>
      <AdminHeader title="Detalle admin" actions={
        <AdminNavActions>
          <AdminButton href="/admin">Admin Central</AdminButton>
          <AdminButton href="/">Inicio</AdminButton>
          <AdminButton href="/admin/proyectos">Volver a proyectos</AdminButton>
          <AdminButton type="button" onClick={onLogout} disabled={loggingOut}>Cerrar sesión</AdminButton>
        </AdminNavActions>
      } />
      {logoutError && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-800">{logoutError}</div>}
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
            <AdminCard className="min-w-0">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                    Detalle admin
                  </p>
                  <h2 className="mt-2 break-words text-2xl font-extrabold text-black md:text-3xl">
                    {project.name}
                  </h2>
                  <p className="mt-2 text-slate-600">
                    {project.department || 'Sin departamento'} /{' '}
                    {project.district || 'Sin distrito'}
                  </p>
                </div>

                <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {project.status || 'Sin estado'}
                </span>
              </div>
            </AdminCard>

            <section className="grid min-w-0 gap-4 md:grid-cols-2">
              <AdminCard className="min-w-0">
                <h2 className="text-xl font-extrabold text-black">
                  Datos principales
                </h2>
                <dl className="mt-4 space-y-3 text-base">
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-slate-500">Categoría</dt>
                    <dd className="min-w-0 break-words font-medium sm:text-right text-slate-900">
                      {project.category || 'Sin categoría'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-slate-500">Monto solicitado</dt>
                    <dd className="min-w-0 break-words font-medium sm:text-right text-slate-900">
                      {getRequestedBudgetLabel(project.requested_budget)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-slate-500">Rango</dt>
                    <dd className="min-w-0 break-words font-medium sm:text-right text-slate-900">
                      {getBudgetCategoryLabel(project.budget_category)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-slate-500">Apoyos</dt>
                    <dd className="min-w-0 break-words font-medium sm:text-right text-slate-900">
                      {currentSupports} / {supportGoal ?? 'No configurado'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-slate-500">Creado</dt>
                    <dd className="min-w-0 break-words font-medium sm:text-right text-slate-900">
                      {formatDate(project.created_at)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-slate-500">Revisión final</dt>
                    <dd className="min-w-0 break-words font-medium sm:text-right text-slate-900">
                      {supportGoal != null && currentSupports >= supportGoal
                        ? 'Elegible'
                        : 'No elegible'}
                    </dd>
                  </div>
                </dl>
              </AdminCard>

              <AdminCard className="min-w-0">
                <h2 className="text-xl font-extrabold text-black">Líder</h2>
                {project.leader ? (
                  <dl className="mt-4 space-y-3 text-base">
                    <div>
                      <dt className="text-slate-500">Nombre</dt>
                      <dd className="break-words font-medium text-slate-900">
                        {project.leader.full_name || 'Sin nombre'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Alias</dt>
                      <dd className="break-words font-medium text-slate-900">
                        {project.leader.alias || 'Sin alias'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Email</dt>
                      <dd className="break-all break-words font-medium text-slate-900">
                        {project.leader.email || 'Sin email'}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-slate-600">
                    No hay líder asociado.
                  </p>
                )}
              </AdminCard>
            </section>

            <AdminCard className="min-w-0">
              <h2 className="text-xl font-extrabold text-black">Objetivo</h2>
              <p className="mt-3 break-words whitespace-pre-wrap text-base leading-6 text-slate-700">
                {project.objective || 'No especificado.'}
              </p>
            </AdminCard>

            <AdminCard className="min-w-0">
              <h2 className="text-xl font-extrabold text-black">
                Descripción
              </h2>
              <p className="mt-3 break-words whitespace-pre-wrap text-base leading-6 text-slate-700">
                {project.description || 'No especificada.'}
              </p>
            </AdminCard>

            {project.pdf_url && (
              <AdminCard className="min-w-0">
                <h2 className="text-xl font-extrabold text-black">
                  Documento PDF
                </h2>
                <AdminButton
                  href={project.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3"
                >
                  Ver PDF
                </AdminButton>
              </AdminCard>
            )}
          </div>
        )}
    </AdminPageShell>
  );
}
