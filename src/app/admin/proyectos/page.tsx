// src/app/admin/proyectos/page.tsx
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
  leader: {
    full_name: string;
    alias: string;
    email: string;
  };
};

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
        leader:project_participants!leader_id (
          full_name,
          alias,
          email
        )
      `)
      .eq('status', filter)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const transformed = (data || []).map((item: any) => ({
      ...item,
      leader: item.leader && item.leader.length > 0 ? item.leader[0] : null,
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Admin - Proyectos Ciudadanos</h1>
          <Link href="/admin" className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300">
            ← Volver al Admin
          </Link>
        </div>

        {/* Mensajes */}
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

        {/* Filtros */}
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

        {/* Lista de proyectos */}
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
            {projects.map((project) => (
              <div key={project.id} className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        {project.category}
                      </span>
                      <span className="text-xs text-slate-500">
                        {project.department} - {project.district}
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
                  <div className="flex gap-2">
  <button
    onClick={() => {
      const viability = prompt('Puntaje de viabilidad (0-100):');
      if (!viability) return;
      const impact = prompt('Puntaje de impacto social (0-100):');
      if (!impact) return;
      const originality = prompt('Puntaje de originalidad (0-100):');
      if (!originality) return;
      const participation = prompt('Puntaje de participación ciudadana (0-100):');
      if (!participation) return;
      
      fetch('/api/admin/proyectos/evaluar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          viability: parseInt(viability),
          impact: parseInt(impact),
          originality: parseInt(originality),
          participation: parseInt(participation),
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('✅ Evaluación guardada correctamente');
          loadProjects();
        } else {
          alert('❌ Error al guardar evaluación');
        }
      })
      .catch(err => alert('Error de conexión: ' + err.message));
    }}
    className="bg-purple-600 text-white px-3 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700"
  >
    📊 Evaluar
  </button>
  
  <Link
    href={`/proyecto-ciudadano/proyectos/${project.id}`}
    className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300"
  >
    Ver detalles
  </Link>
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