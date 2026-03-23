// src/app/proyecto-ciudadano/proyectos/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
  leader: {
    alias: string;
    full_name: string;
  } | null;
};

export default function ProyectosActivosPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Departamentos de Perú
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
      // Obtener proyectos activos (aprobados)
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
          leader:project_participants!leader_id (
            alias,
            full_name
          )
        `)
        .eq('status', 'active')
        .order('beneficiary_count', { ascending: false });

      if (error) throw error;

      // Transformar los datos: leader viene como array, lo convertimos a objeto
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
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          project.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          project.district.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesDepartment && matchesSearch;
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Proyectos Ciudadanos Activos</h1>
          <Link href="/proyecto-ciudadano" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        {/* Descripción */}
        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 mb-6 shadow-sm">
          <p className="text-slate-700">
            Estos son los proyectos ciudadanos que han sido aprobados y están recibiendo apoyo vecinal.
            Cada departamento puede tener un proyecto activo. Apoya los proyectos de tu comunidad.
          </p>
        </div>

        {/* Filtros */}
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

        {/* Lista de proyectos */}
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
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      {project.category}
                    </span>
                    <span className="text-xs text-slate-500">
                      {project.department}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2">
                    {project.name}
                  </h2>

                  <p className="text-sm text-slate-600 mb-3 line-clamp-3">
                    {project.objective}
                  </p>

                  <div className="text-xs text-slate-500 mb-3">
                    📍 {project.district} | 👤 {project.leader?.alias || project.leader?.full_name?.split(' ')[0] || 'Anónimo'}
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                      <span>🤝</span>
                      <span>{project.beneficiary_count || 0} apoyos</span>
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
            ))}
          </div>
        )}
      </div>
    </main>
  );
}