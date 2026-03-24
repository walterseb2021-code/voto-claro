// src/app/espacio-emprendedor/explorar/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
  owner: {
    alias: string;
  };
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
  'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho',
  'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica',
  'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios',
  'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'
];

export default function ExplorarProyectosPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedDepartment, setSelectedDepartment] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [participant, setParticipant] = useState<any>(null);
  const [contactando, setContactando] = useState<string | null>(null);
  const [contactMsg, setContactMsg] = useState<string | null>(null);

  useEffect(() => {
    cargarParticipante();
    cargarProyectos();
  }, []);

  const cargarParticipante = async () => {
    const deviceId = localStorage.getItem('vc_device_id');
    if (deviceId) {
      const { data } = await supabase
        .from('project_participants')
        .select('id, alias')
        .eq('device_id', deviceId)
        .maybeSingle();
      setParticipant(data);
    }
  };

  const cargarProyectos = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
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
          created_at,
          owner:espacio_afiliados!owner_id (
            participant:project_participants (
              alias
            )
          )
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Transformar datos
      const transformed = (data || []).map((item: any) => ({
        ...item,
        owner: item.owner?.participant?.[0] || { alias: 'Anónimo' },
      }));

      setProjects(transformed);
    } catch (err: any) {
      console.error('Error cargando proyectos:', err);
      setError(err.message || 'Error al cargar proyectos');
    } finally {
      setLoading(false);
    }
  };

  const handleContactar = async (projectId: string, ownerAlias: string) => {
    if (!participant) {
      setContactMsg('Debes registrarte para contactar a emprendedores.');
      setTimeout(() => setContactMsg(null), 3000);
      return;
    }

    setContactando(projectId);
    setContactMsg(null);

    try {
      // Aquí se enviaría el correo al emprendedor
      // Por ahora simulamos una respuesta exitosa
      await new Promise(resolve => setTimeout(resolve, 1000));

      setContactMsg(`✅ Mensaje enviado a ${ownerAlias}. Te contactarán pronto.`);
      setTimeout(() => setContactMsg(null), 4000);
    } catch (err) {
      setContactMsg('❌ Error al enviar mensaje. Intenta nuevamente.');
      setTimeout(() => setContactMsg(null), 3000);
    } finally {
      setContactando(null);
    }
  };

  const filteredProjects = projects.filter(project => {
    const matchesCategory = selectedCategory === 'Todas' || project.category === selectedCategory;
    const matchesDepartment = selectedDepartment === 'Todos' || project.department === selectedDepartment;
    const matchesSearch = project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          project.summary.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesDepartment && matchesSearch;
  });

  const formatInvestment = (min: number | null, max: number | null) => {
    if (min && max) return `S/ ${min.toLocaleString()} - S/ ${max.toLocaleString()}`;
    if (min) return `Desde S/ ${min.toLocaleString()}`;
    if (max) return `Hasta S/ ${max.toLocaleString()}`;
    return 'No especificado';
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Explorar proyectos emprendedores</h1>
          <Link href="/espacio-emprendedor" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        {/* Mensaje de contacto */}
        {contactMsg && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${
            contactMsg.includes('✅') ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            {contactMsg}
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-2xl border-2 border-red-600 p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Categoría</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                {CATEGORIAS.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
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
                {DEPARTAMENTOS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
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

        {/* Lista de proyectos */}
        {loading ? (
          <p className="text-slate-600 text-center py-12">Cargando proyectos...</p>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4">
            {error}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 text-center">
            <p className="text-slate-600">No hay proyectos que coincidan con los filtros seleccionados.</p>
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
              <div key={project.id} className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden">
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
                    {project.title}
                  </h2>

                  <p className="text-sm text-slate-600 mb-3 line-clamp-3">
                    {project.summary}
                  </p>

                  <div className="text-xs text-slate-500 mb-3">
                    📍 {project.district} | 👤 {project.owner?.alias || 'Anónimo'}
                  </div>

                  <div className="text-sm font-semibold text-slate-700 mb-4">
                    💰 Inversión: {formatInvestment(project.investment_min, project.investment_max)}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleContactar(project.id, project.owner?.alias || 'el emprendedor')}
                      disabled={contactando === project.id}
                      className="flex-1 bg-green-700 text-white px-3 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition disabled:opacity-50"
                    >
                      {contactando === project.id ? 'Enviando...' : '📩 Contactar'}
                    </button>
                    {project.pdf_url && (
                      <a
                        href={project.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition"
                      >
                        📄 PDF
                      </a>
                    )}
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