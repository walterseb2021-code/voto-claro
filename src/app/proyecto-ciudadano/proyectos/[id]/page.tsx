// src/app/proyecto-ciudadano/proyectos/[id]/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  status: string;
  leader: {
    id: string;
    alias: string;
    full_name: string;
    email: string;
  } | null;
};

type ForumPost = {
  id: string;
  content: string;
  created_at: string;
  participant: {
    alias: string;
  };
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [supporting, setSupporting] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [newPost, setNewPost] = useState('');
  const [sendingPost, setSendingPost] = useState(false);
  const [activeCycle, setActiveCycle] = useState<any>(null);

  // Cargar datos
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1. Obtener participante actual
        const deviceId = localStorage.getItem('vc_device_id');
        let currentParticipant = null;
        if (deviceId) {
          const { data: pData } = await supabase
            .from('project_participants')
            .select('*')
            .eq('device_id', deviceId)
            .maybeSingle();
          currentParticipant = pData;
          setParticipant(currentParticipant);
        }

        // 2. Obtener ciclo activo
        const { data: cycleData } = await supabase
          .from('project_cycles')
          .select('*')
          .eq('is_active', true)
          .maybeSingle();
        setActiveCycle(cycleData);

        // 3. Obtener proyecto
        const { data: projectData, error: projectError } = await supabase
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
            status,
            leader:project_participants!leader_id (
              id,
              alias,
              full_name,
              email
            )
          `)
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;

        // Transformar leader (viene como array)
        const transformedProject = {
          ...projectData,
          leader: projectData.leader && projectData.leader.length > 0 ? projectData.leader[0] : null,
        };
        setProject(transformedProject);

        // 4. Verificar si el usuario ya apoya este proyecto
        if (currentParticipant && cycleData) {
          const { data: supportData } = await supabase
            .from('project_supports')
            .select('id')
            .eq('project_id', projectId)
            .eq('participant_id', currentParticipant.id)
            .eq('cycle_id', cycleData.id)
            .maybeSingle();
          setSupporting(!!supportData);
        }

        // 5. Cargar foro
        const { data: forumData } = await supabase
          .from('project_forum_posts')
          .select(`
            id,
            content,
            created_at,
            participant:project_participants!participant_id (
              alias
            )
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        const transformedForum = (forumData || []).map((post: any) => ({
          ...post,
          participant: post.participant && post.participant.length > 0 ? post.participant[0] : { alias: 'Anónimo' },
        }));
        setForumPosts(transformedForum);
      } catch (err: any) {
        console.error('Error cargando proyecto:', err);
        setError(err.message || 'Error al cargar el proyecto');
      } finally {
        setLoading(false);
      }
    }

    if (projectId) {
      loadData();
    }
  }, [projectId]);

  // Apoyar proyecto
  const handleSupport = async () => {
    if (!participant) {
      alert('Debes registrarte para apoyar proyectos.');
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    if (!activeCycle) {
      alert('No hay un ciclo activo en este momento.');
      return;
    }

    if (supporting) {
      alert('Ya estás apoyando este proyecto.');
      return;
    }

    // Verificar si ya apoya otro proyecto en este ciclo
    const { data: existingSupport } = await supabase
      .from('project_supports')
      .select('id, project_id')
      .eq('participant_id', participant.id)
      .eq('cycle_id', activeCycle.id)
      .maybeSingle();

    if (existingSupport) {
      alert('Solo puedes apoyar un proyecto por ciclo. Ya estás apoyando otro proyecto.');
      return;
    }

    setSupportLoading(true);
    try {
      const { error } = await supabase
        .from('project_supports')
        .insert({
          project_id: projectId,
          participant_id: participant.id,
          cycle_id: activeCycle.id,
          approved_by: project?.leader_id,
        });

      if (error) throw error;

      setSupporting(true);
      // Actualizar contador
      setProject(prev => prev ? { ...prev, beneficiary_count: (prev.beneficiary_count || 0) + 1 } : null);
      alert('¡Gracias por apoyar este proyecto!');
    } catch (err: any) {
      console.error('Error al apoyar:', err);
      alert(err.message || 'Error al apoyar el proyecto');
    } finally {
      setSupportLoading(false);
    }
  };

  // Publicar en el foro
  const handlePost = async () => {
    if (!participant) {
      alert('Debes registrarte para participar en el foro.');
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    if (!newPost.trim()) return;

    setSendingPost(true);
    try {
      const { error } = await supabase
        .from('project_forum_posts')
        .insert({
          project_id: projectId,
          participant_id: participant.id,
          content: newPost.trim(),
        });

      if (error) throw error;

      // Agregar post localmente
      const newPostObj: ForumPost = {
        id: Date.now().toString(),
        content: newPost.trim(),
        created_at: new Date().toISOString(),
        participant: { alias: participant.alias || 'Anónimo' },
      };
      setForumPosts(prev => [...prev, newPostObj]);
      setNewPost('');
    } catch (err: any) {
      console.error('Error al publicar:', err);
      alert(err.message || 'Error al publicar');
    } finally {
      setSendingPost(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-xl p-4 mb-4">
            {error || 'Proyecto no encontrado'}
          </div>
          <Link href="/proyecto-ciudadano/proyectos" className="text-green-700 hover:underline">
            ← Volver a proyectos
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <Link href="/proyecto-ciudadano/proyectos" className="text-sm text-slate-600 hover:underline">
            ← Volver a proyectos
          </Link>
        </div>

        {/* Información del proyecto */}
        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
              {project.category}
            </span>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
              {project.department} - {project.district}
            </span>
            <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {project.beneficiary_count || 0} apoyos
            </span>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Objetivo general</h2>
            <p className="text-slate-800">{project.objective}</p>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Descripción</h2>
            <p className="text-slate-800 whitespace-pre-wrap">{project.description}</p>
          </div>

          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Líder del proyecto</h2>
            <p className="text-slate-800">{project.leader?.alias || project.leader?.full_name || 'Anónimo'}</p>
            {project.leader?.email && <p className="text-sm text-slate-500">{project.leader.email}</p>}
          </div>

          {project.pdf_url && (
            <div className="mt-4">
              <a
                href={project.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-slate-200 text-slate-800 px-4 py-2 rounded-xl font-semibold hover:bg-slate-300 transition"
              >
                📄 Descargar documento del proyecto (PDF)
              </a>
            </div>
          )}

          {/* Botón de apoyo */}
          {project.status === 'active' && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={handleSupport}
                disabled={supportLoading || supporting}
                className={`w-full py-3 rounded-xl font-semibold transition ${
                  supporting
                    ? 'bg-green-100 text-green-700 cursor-default'
                    : 'bg-green-700 text-white hover:bg-green-800'
                }`}
              >
                {supportLoading ? 'Procesando...' : supporting ? '✓ Ya estás apoyando este proyecto' : '🤝 Apoyar este proyecto'}
              </button>
              {!participant && (
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Para apoyar, primero debes <Link href="/proyecto-ciudadano/registro" className="text-green-700 underline">registrarte</Link>.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Foro de discusión */}
        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Foro de discusión</h2>
          <p className="text-sm text-slate-600 mb-4">
            Participa con ideas y preguntas sobre este proyecto.
          </p>

          {/* Lista de posts */}
          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
            {forumPosts.length === 0 ? (
              <p className="text-slate-500 text-sm">No hay comentarios aún. Sé el primero en participar.</p>
            ) : (
              forumPosts.map((post) => (
                <div key={post.id} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-slate-700">{post.participant?.alias || 'Anónimo'}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800">{post.content}</p>
                </div>
              ))
            )}
          </div>

          {/* Formulario para nuevo post */}
          {participant ? (
            <div className="flex gap-2">
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="Escribe tu comentario o pregunta..."
                rows={2}
                className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={handlePost}
                disabled={sendingPost || !newPost.trim()}
                className="bg-green-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
              >
                {sendingPost ? 'Enviando...' : 'Publicar'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center">
              <Link href="/proyecto-ciudadano/registro" className="text-green-700 underline">Regístrate</Link> para participar en el foro.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}