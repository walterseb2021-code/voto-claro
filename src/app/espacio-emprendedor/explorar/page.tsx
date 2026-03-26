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
    full_name: string;  // ← AGREGADO: nombre real
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
  
  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('✅ Notificaciones permitidas');
        }
      });
    }
  };

  const showNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  useEffect(() => {
    cargarParticipante();
    cargarProyectos();
    requestNotificationPermission();
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
              alias,
              full_name
            )
          )
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      const transformed = (data || []).map((item: any) => ({
        ...item,
        owner: item.owner?.participant?.[0] || { alias: 'Anónimo', full_name: 'Anónimo' },
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      setContactMsg(`✅ Mensaje enviado a ${ownerAlias}. Te contactarán pronto.`);
      showNotification('📩 Mensaje enviado', `Te contactarás con ${ownerAlias} pronto.`);
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

        {contactMsg && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${
            contactMsg.includes('✅') ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            {contactMsg}
          </div>
        )}

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

        {loading ? (
          <p className="text-slate-600 text-center py-12">Cargando proyectos...</p>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4">{error}</div>
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
              <div key={project.id} className="bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-semibold bg-gradient-to-r from-green-600 to-green-700 text-black px-3 py-1 rounded-full shadow-sm">
                      {project.category}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-800 mb-2 line-clamp-2 hover:text-green-700 transition">
                    {project.title}
                  </h2>

                  <p className="text-sm text-slate-600 mb-4 line-clamp-3">
                    {project.summary}
                  </p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {project.district}, {project.department}
                    </span>
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">
                      💰 {formatInvestment(project.investment_min, project.investment_max)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
                        {project.owner?.full_name?.charAt(0).toUpperCase() || project.owner?.alias?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800">
                          {project.owner?.full_name !== 'Anónimo' ? project.owner?.full_name : project.owner?.alias || 'Anónimo'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {project.pdf_url && (
                        <a
                          href={project.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-green-700 transition p-2"
                          title="Ver documento"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </a>
                      )}
                      <Link
                        href={`/espacio-emprendedor/proyectos/${project.id}`}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition shadow-sm whitespace-nowrap"
                      >
                        Ver detalles
                      </Link>
                    </div>
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