'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

const PROFESSIONAL_TYPES = [
  'Abogado / Asesor legal',
  'Contador / Asesor contable',
  'Asesor tributario',
  'Asesor financiero',
  'Formulador de proyectos',
  'Especialista en plan de negocio',
  'Asesor de marketing y ventas',
  'Consultor empresarial',
  'Especialista en propiedad intelectual / marca',
  'Otro',
];

const SPECIALTIES = [
  'Contratos con inversionistas',
  'Constitución de empresas',
  'Tributación',
  'Contabilidad',
  'Presupuestos y costos',
  'Plan financiero',
  'Plan de negocio',
  'Formulación de proyectos',
  'Marketing digital',
  'Ventas',
  'Propiedad intelectual',
  'Formalización',
  'Gestión empresarial',
  'Finanzas para emprendedores',
];

const SERVICES = [
  'Revisión de contratos',
  'Elaboración de contratos',
  'Asesoría contable',
  'Asesoría tributaria',
  'Elaboración de plan de negocio',
  'Revisión de presupuesto',
  'Preparación de pitch',
  'Asesoría para formalización',
  'Asesoría financiera',
  'Revisión legal antes de inversión',
  'Orientación para marca o propiedad intelectual',
  'Mentoría general de proyecto',
];

const DEPARTAMENTOS = [
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

const ATTENTION_MODES = [
  'Virtual',
  'Presencial',
  'Virtual y presencial',
];

const SERVICE_MODES = [
  'Gratuito',
  'Pago',
  'Mixto: primera orientación gratuita y servicios especializados de pago',
  'Pro bono sujeto a evaluación del caso',
  'No especificado',
];

const EDUCATIONAL_ACTIVITIES = [
  'Publicar cursos',
  'Publicar talleres',
  'Publicar webinars',
  'Publicar videos educativos',
  'Publicar material descargable',
  'Participar en foros',
];

const TRAINING_CATEGORIES = [
  'Marketing',
  'Finanzas',
  'Contabilidad',
  'Tributación',
  'Legal',
  'Ventas',
  'Inteligencia Artificial',
  'Comercio electrónico',
  'Formulación de proyectos',
  'Liderazgo',
];

const TRAINING_RESOURCE_TYPES = [
  'Curso',
  'Taller',
  'Webinar',
  'Video educativo',
  'PDF / material descargable',
  'Guía',
  'Enlace externo',
];

type ProfessionalConversationMessage = {
  id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_alias: string;
  is_from_me: boolean;
};

type ProfessionalConversation = {
  thread_key: string;
  professional_id: string;
  other_participant_id: string;
  other_participant_alias: string;
  last_message_at: string;
  messages: ProfessionalConversationMessage[];
};

type TrainingPublication = {
  id: string;
  professional_id: string;
  participant_id: string;
  title: string;
  description: string | null;
  category: string;
  resource_type: string;
  resource_url: string;
  is_free: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  admin_note: string | null;
  reviewed_at: string | null;
  rejected_reason: string | null;
  updated_by_admin: boolean;
};

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('vc_device_id') || '';
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
  });
}

function getTrainingStatusLabel(status: string) {
  if (status === 'active') return 'Activo / visible';
  if (status === 'pending') return 'En revisión';
  if (status === 'inactive') return 'Inactivo';
  if (status === 'rejected') return 'Observado';
  return status || 'Sin estado';
}

function getTrainingStatusClass(status: string) {
  if (status === 'active') return 'bg-green-100 text-green-800 border-green-300';
  if (status === 'pending') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (status === 'inactive') return 'bg-slate-100 text-slate-700 border-slate-300';
  if (status === 'rejected') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

export default function RegistroProfesionalPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [participant, setParticipant] = useState<any>(null);
  const [existingProfile, setExistingProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [codigoProfesional, setCodigoProfesional] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ProfessionalConversation[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyLoadingKey, setReplyLoadingKey] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<Record<string, string>>({});
  const [replySuccess, setReplySuccess] = useState<Record<string, string>>({});

  const [publishingTraining, setPublishingTraining] = useState(false);
  const [trainingSuccess, setTrainingSuccess] = useState<string | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);

  const [trainingForm, setTrainingForm] = useState({
    title: '',
    category: TRAINING_CATEGORIES[0],
    resource_type: 'Video educativo',
    resource_url: '',
    description: '',
  });

  const [myTrainings, setMyTrainings] = useState<TrainingPublication[]>([]);
  const [loadingMyTrainings, setLoadingMyTrainings] = useState(false);
  const [myTrainingsError, setMyTrainingsError] = useState<string | null>(null);
  const [trainingActionMessage, setTrainingActionMessage] = useState<string | null>(null);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [updatingTraining, setUpdatingTraining] = useState(false);
  const [deactivatingTrainingId, setDeactivatingTrainingId] = useState<string | null>(null);
  const [editTrainingForm, setEditTrainingForm] = useState({
    title: '',
    category: TRAINING_CATEGORIES[0],
    resource_type: 'Video educativo',
    resource_url: '',
    description: '',
  });

  const [form, setForm] = useState({
    public_name: '',
    professional_type: '',
    specialties: [] as string[],
    services: [] as string[],
    department: '',
    province: '',
    district: '',
    attention_mode: 'Virtual y presencial',
    service_mode: 'No especificado',
    service_mode_note: '',
    educational_activities: [] as string[],
    training_categories: [] as string[],
    experience_summary: '',
    public_message: '',
    document_url: '',
    data_truth_confirmed: false,
    terms_accepted: false,
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const loadProfessionalMessages = async () => {
    const deviceId = getDeviceId();

    if (!deviceId) return;

    setLoadingMessages(true);
    setMessagesError(null);

    try {
      const res = await fetch(
        `/api/espacio-emprendedor/profesionales/mensajes?device_id=${encodeURIComponent(deviceId)}`,
        {
          cache: 'no-store',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudieron cargar los mensajes.');
      }

      setConversations(data.conversations || []);
    } catch (err: any) {
      console.error('Error cargando mensajes profesionales:', err);
      setMessagesError(err.message || 'No se pudieron cargar los mensajes.');
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMyTrainings = async () => {
    const deviceId = getDeviceId();

    if (!deviceId) return;

    setLoadingMyTrainings(true);
    setMyTrainingsError(null);

    try {
      const res = await fetch(
        `/api/espacio-emprendedor/capacitaciones/mine?device_id=${encodeURIComponent(deviceId)}`,
        {
          cache: 'no-store',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudieron cargar tus capacitaciones.');
      }

      setMyTrainings(data?.capacitaciones || []);
    } catch (err: any) {
      console.error('Error cargando mis capacitaciones:', err);
      setMyTrainingsError(
        err.message || 'No se pudieron cargar tus capacitaciones publicadas.'
      );
    } finally {
      setLoadingMyTrainings(false);
    }
  };

  const filledFields = useMemo(() => {
    return [
      form.public_name ? 'nombre público' : null,
      form.professional_type ? 'tipo profesional' : null,
      form.specialties.length ? 'especialidades' : null,
      form.services.length ? 'servicios' : null,
      form.department ? 'departamento' : null,
      form.province ? 'provincia' : null,
      form.district ? 'distrito' : null,
      form.attention_mode ? 'modalidad de atención' : null,
      form.service_mode && form.service_mode !== 'No especificado'
        ? 'modalidad económica del servicio'
        : null,
      form.service_mode_note ? 'condiciones del servicio' : null,
      form.educational_activities.length ? 'actividades educativas' : null,
      form.training_categories.length ? 'categorías de capacitación' : null,
      form.experience_summary ? 'experiencia resumida' : null,
      form.public_message ? 'mensaje público' : null,
      form.document_url || pdfFile ? 'documento PDF de respaldo' : null,
      form.data_truth_confirmed ? 'declaración de veracidad' : null,
      form.terms_accepted ? 'aceptación de condiciones' : null,
    ].filter(Boolean) as string[];
  }, [form, pdfFile]);

  const missingFields = useMemo(() => {
    return [
      !form.public_name ? 'nombre público' : null,
      !form.professional_type ? 'tipo profesional' : null,
      !form.specialties.length ? 'al menos una especialidad' : null,
      !form.services.length ? 'al menos un servicio' : null,
      !form.service_mode || form.service_mode === 'No especificado'
        ? 'modalidad económica del servicio'
        : null,
      !form.document_url && !pdfFile ? 'PDF de respaldo profesional' : null,
      !form.data_truth_confirmed ? 'declaración de veracidad' : null,
      !form.terms_accepted ? 'aceptación de condiciones' : null,
    ].filter(Boolean) as string[];
  }, [form, pdfFile]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const deviceId = getDeviceId();

        if (!deviceId) {
          router.push('/proyecto-ciudadano/registro?returnTo=profesional-asesor');
          return;
        }

        const res = await fetch(
          `/api/espacio-emprendedor/profesionales/me?device_id=${encodeURIComponent(deviceId)}`,
          {
            cache: 'no-store',
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || 'No se pudo cargar tu ficha profesional.');
        }

        if (!data.participant) {
          router.push('/proyecto-ciudadano/registro?returnTo=profesional-asesor');
          return;
        }

        setParticipant(data.participant);

        const professionalData = data.profile;

        if (professionalData) {
          setExistingProfile(professionalData);
          setCodigoProfesional(professionalData.codigo_profesional || null);

          setForm({
            public_name: professionalData.public_name || '',
            professional_type: professionalData.professional_type || '',
            specialties: professionalData.specialties || [],
            services: professionalData.services || [],
            department: professionalData.department || '',
            province: professionalData.province || '',
            district: professionalData.district || '',
            attention_mode:
              professionalData.attention_mode || 'Virtual y presencial',
            service_mode: professionalData.service_mode || 'No especificado',
            service_mode_note: professionalData.service_mode_note || '',
            educational_activities:
              professionalData.educational_activities || [],
            training_categories:
              professionalData.training_categories || [],
            experience_summary: professionalData.experience_summary || '',
            public_message: professionalData.public_message || '',
            document_url: professionalData.document_url || '',
            data_truth_confirmed: Boolean(professionalData.data_truth_confirmed),
            terms_accepted: Boolean(professionalData.terms_accepted),
          });

          await loadProfessionalMessages();
          await loadMyTrainings();
        } else {
          setExistingProfile(null);
          setCodigoProfesional(null);
          setConversations([]);
        }
      } catch (err: any) {
        console.error('Error cargando registro profesional:', err);
        setError(err.message || 'No se pudo cargar la información del profesional.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  useEffect(() => {
    const activeViewTitle = loading
      ? 'Cargando registro profesional'
      : successMessage
      ? 'Ficha profesional guardada'
      : error
      ? 'Registro profesional con error'
      : existingProfile
      ? 'Editar ficha profesional'
      : 'Formulario de registro profesional';

    const visibleParts = [
      `Vista activa: ${activeViewTitle}.`,
      'Pantalla visible: Registro de profesional asesor.',
      'Esta pantalla permite registrar o actualizar una ficha profesional declarada por el propio usuario.',
      'El profesional debe indicar nombre público, tipo profesional, especialidades, servicios, modalidad de atención, modalidad económica del servicio, experiencia resumida y documento PDF de respaldo.',
      'La pantalla también permite declarar actividades educativas, categorías de capacitación y publicar enlaces gratuitos a cursos, talleres, videos o materiales educativos.',
      'Voto Claro no certifica, avala ni garantiza la capacidad profesional, honorarios, resultados ni cumplimiento del servicio.',
      participant
        ? 'Hay participante registrado con sesión activa.'
        : 'No hay participante registrado visible en esta pantalla.',
      codigoProfesional
        ? `Código profesional visible: ${codigoProfesional}.`
        : 'Todavía no hay código profesional visible.',
      filledFields.length
        ? `Campos con contenido: ${filledFields.join(', ')}.`
        : 'Todavía no hay campos completados.',
      missingFields.length
        ? `Campos pendientes: ${missingFields.join(', ')}.`
        : 'No hay campos obligatorios pendientes.',
      form.educational_activities.length
        ? `Actividades educativas seleccionadas: ${form.educational_activities.join(', ')}.`
        : 'No hay actividades educativas seleccionadas.',
      form.training_categories.length
        ? `Categorías de capacitación seleccionadas: ${form.training_categories.join(', ')}.`
        : 'No hay categorías de capacitación seleccionadas.',
      trainingForm.title
        ? `Título de capacitación en edición: ${trainingForm.title}.`
        : 'No hay título de capacitación en edición.',
      myTrainings.length
        ? `Capacitaciones publicadas por este profesional: ${myTrainings.length}.`
        : 'No hay capacitaciones publicadas por este profesional visibles en esta pantalla.',
    ];

    if (saving) visibleParts.push('La ficha profesional se está guardando.');
    if (uploadingPdf) visibleParts.push('El PDF de respaldo profesional se está subiendo.');
    if (publishingTraining) visibleParts.push('La capacitación gratuita se está publicando.');
    if (successMessage) visibleParts.push(`Mensaje de éxito visible: ${successMessage}.`);
    if (trainingSuccess) visibleParts.push(`Mensaje de capacitación visible: ${trainingSuccess}.`);
    if (error) visibleParts.push(`Error visible: ${error}.`);
    if (trainingError) visibleParts.push(`Error de capacitación visible: ${trainingError}.`);

    setPageContext({
      pageId: 'espacio-emprendedor-apoyo-profesionales-registro',
      pageTitle: 'Registro profesional asesor',
      route: '/espacio-emprendedor/apoyo/profesionales/registro',
      summary:
        'Formulario para registrar o actualizar la ficha de un profesional asesor y publicar capacitaciones gratuitas dentro del Centro de Apoyo al Emprendedor.',
      speakableSummary:
        'Estás en el registro de profesional asesor. Aquí puedes completar tu ficha profesional, seleccionar especialidades, servicios, modalidad de atención, actividades educativas, categorías de capacitación, subir un PDF de respaldo y publicar enlaces gratuitos a cursos, talleres, videos o materiales. Voto Claro no certifica ni garantiza servicios profesionales.',
      activeSection: loading
        ? 'registro-profesional-cargando'
        : successMessage
        ? 'registro-profesional-exitoso'
        : error
        ? 'registro-profesional-error'
        : 'registro-profesional-formulario',
      activeViewId: loading
        ? 'loading'
        : successMessage
        ? 'success'
        : error
        ? 'error'
        : 'form',
      activeViewTitle,
      breadcrumb: [
        'Espacio Emprendedor',
        'Centro de Apoyo',
        'Profesionales',
        'Registro',
      ],
      visibleSections: [
        'datos-profesionales',
        'especialidades',
        'servicios',
        'ubicacion-atencion',
        'actividades-educativas',
        'categorias-capacitacion',
        'modalidad-economica-servicio',
        'experiencia',
        'documento-respaldo',
        'declaraciones',
        'mis-capacitaciones-publicadas',
        'publicar-capacitacion-gratuita',
      ],
      visibleActions: [
        'Volver a profesionales',
        'Guardar ficha profesional',
        'Subir PDF de respaldo',
        'Seleccionar especialidades',
        'Seleccionar servicios',
        'Configurar actividades educativas',
        'Seleccionar categorías de capacitación',
        'Publicar capacitación gratuita',
        'Editar capacitación publicada',
        'Desactivar capacitación publicada',
      ],
      availableActions: [
        'Volver a profesionales',
        'Guardar ficha profesional',
        'Subir PDF de respaldo',
        'Seleccionar especialidades',
        'Seleccionar servicios',
        'Configurar actividades educativas',
        'Seleccionar categorías de capacitación',
        'Publicar capacitación gratuita',
        'Editar capacitación publicada',
        'Desactivar capacitación publicada',
      ],
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: form.public_name || codigoProfesional || undefined,
      status:
        loading || saving || uploadingPdf || publishingTraining
          ? 'loading'
          : error || trainingError
          ? 'error'
          : 'ready',
      suggestedPrompts: [
        {
          id: 'ee-prof-reg-1',
          label: '¿Qué me falta?',
          question: '¿Qué campos me faltan completar en esta ficha profesional?',
        },
        {
          id: 'ee-prof-reg-2',
          label: '¿Ya tengo código?',
          question: '¿Ya tengo código profesional visible en esta pantalla?',
        },
        {
          id: 'ee-prof-reg-3',
          label: '¿Qué documento necesito?',
          question: '¿Qué documento PDF debo subir como respaldo profesional?',
        },
        {
          id: 'ee-prof-reg-4',
          label: 'Publicar curso',
          question:
            '¿Dónde puedo publicar un curso, taller, video o material gratuito?',
        },
        {
          id: 'ee-prof-reg-5',
          label: '¿Voto Claro certifica?',
          question: '¿Voto Claro certifica o garantiza mis servicios profesionales?',
        },
      ],
      dynamicData: {
        participantVisible: !!participant,
        existingProfileVisible: !!existingProfile,
        codigoProfesional: codigoProfesional || null,
        filledFields,
        missingFields,
        pdfLoaded: !!pdfFile || !!form.document_url,
        serviceMode: form.service_mode,
        serviceModeNoteFilled: !!form.service_mode_note,
        educationalActivities: form.educational_activities,
        trainingCategories: form.training_categories,
        trainingPublicationFormVisible: true,
        trainingPublicationAllowed: !!existingProfile,
        trainingPublicationCategory: trainingForm.category,
        trainingPublicationType: trainingForm.resource_type,
        myTrainingsCount: myTrainings.length,
        loadingMyTrainings,
        myTrainingsError: myTrainingsError || null,
        editingTrainingId: editingTrainingId || null,
        updatingTraining,
        deactivatingTrainingId: deactivatingTrainingId || null,
        trainingActionMessage: trainingActionMessage || null,
        professionalConversationsCount: conversations.length,
        professionalMessagesLoading: loadingMessages,
        professionalMessagesError: messagesError || null,
        replyLoadingKey,
        saving,
        uploadingPdf,
        publishingTraining,
        successMessage: successMessage || null,
        trainingSuccess: trainingSuccess || null,
        error: error || null,
        trainingError: trainingError || null,
        disclaimer:
          'Voto Claro no certifica, avala ni garantiza profesionales, honorarios, resultados, capacitaciones ni cumplimiento de servicios.',
      },
      contextVersion: 'ee-profesional-registro-v2-capacitaciones',
    });

    return () => {
      clearPageContext();
    };
  }, [
    setPageContext,
    clearPageContext,
    loading,
    saving,
    uploadingPdf,
    publishingTraining,
    error,
    trainingError,
    successMessage,
    trainingSuccess,
    participant,
    existingProfile,
    codigoProfesional,
    form,
    trainingForm,
    myTrainings.length,
    loadingMyTrainings,
    myTrainingsError,
    editingTrainingId,
    updatingTraining,
    deactivatingTrainingId,
    trainingActionMessage,
    filledFields,
    missingFields,
    pdfFile,
    conversations,
    loadingMessages,
    messagesError,
    replyLoadingKey,
  ]);

  const handleChangeText = (
    field: keyof typeof form,
    value: string | boolean | string[]
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTrainingChange = (
    field: keyof typeof trainingForm,
    value: string
  ) => {
    setTrainingForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleEditTrainingChange = (
    field: keyof typeof editTrainingForm,
    value: string
  ) => {
    setEditTrainingForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleStartEditTraining = (training: TrainingPublication) => {
    setTrainingActionMessage(null);
    setMyTrainingsError(null);
    setEditingTrainingId(training.id);
    setEditTrainingForm({
      title: training.title || '',
      category: training.category || TRAINING_CATEGORIES[0],
      resource_type: training.resource_type || 'Video educativo',
      resource_url: training.resource_url || '',
      description: training.description || '',
    });
  };

  const handleCancelEditTraining = () => {
    setEditingTrainingId(null);
    setEditTrainingForm({
      title: '',
      category: TRAINING_CATEGORIES[0],
      resource_type: 'Video educativo',
      resource_url: '',
      description: '',
    });
  };

  const handleUpdateTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyTrainingsError(null);
    setTrainingActionMessage(null);

    if (!editingTrainingId) {
      setMyTrainingsError('No se pudo identificar la capacitación que deseas editar.');
      return;
    }

    if (!editTrainingForm.title.trim() || editTrainingForm.title.trim().length < 4) {
      setMyTrainingsError('Debes indicar un título válido para la capacitación.');
      return;
    }

    if (!editTrainingForm.resource_url.trim().startsWith('http://') &&
        !editTrainingForm.resource_url.trim().startsWith('https://')) {
      setMyTrainingsError('Debes pegar un enlace válido que empiece con http:// o https://.');
      return;
    }

    const deviceId = getDeviceId();

    if (!deviceId) {
      setMyTrainingsError('No se pudo identificar tu sesión. Inicia sesión nuevamente.');
      return;
    }

    setUpdatingTraining(true);

    try {
      const res = await fetch('/api/espacio-emprendedor/capacitaciones/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          capacitacion_id: editingTrainingId,
          title: editTrainingForm.title,
          description: editTrainingForm.description,
          category: editTrainingForm.category,
          resource_type: editTrainingForm.resource_type,
          resource_url: editTrainingForm.resource_url,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo actualizar la capacitación.');
      }

      setTrainingActionMessage(data?.message || 'Capacitación actualizada correctamente.');
      setEditingTrainingId(null);
      await loadMyTrainings();
    } catch (err: any) {
      console.error('Error actualizando capacitación:', err);
      setMyTrainingsError(err.message || 'No se pudo actualizar la capacitación.');
    } finally {
      setUpdatingTraining(false);
    }
  };

  const handleDeactivateTraining = async (training: TrainingPublication) => {
    const confirmed = window.confirm(
      `¿Deseas desactivar esta capacitación?\n\n${training.title}\n\nYa no aparecerá en la página pública de capacitación.`
    );

    if (!confirmed) return;

    const deviceId = getDeviceId();

    if (!deviceId) {
      setMyTrainingsError('No se pudo identificar tu sesión. Inicia sesión nuevamente.');
      return;
    }

    setMyTrainingsError(null);
    setTrainingActionMessage(null);
    setDeactivatingTrainingId(training.id);

    try {
      const res = await fetch('/api/espacio-emprendedor/capacitaciones/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          capacitacion_id: training.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo desactivar la capacitación.');
      }

      setTrainingActionMessage(data?.message || 'Capacitación desactivada correctamente.');

      if (editingTrainingId === training.id) {
        handleCancelEditTraining();
      }

      await loadMyTrainings();
    } catch (err: any) {
      console.error('Error desactivando capacitación:', err);
      setMyTrainingsError(err.message || 'No se pudo desactivar la capacitación.');
    } finally {
      setDeactivatingTrainingId(null);
    }
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);

    const file = e.target.files?.[0] || null;

    if (!file) {
      setPdfFile(null);
      return;
    }

    if (file.type !== 'application/pdf') {
      setError('Solo se permite subir un archivo PDF.');
      setPdfFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('El PDF no debe superar los 10 MB.');
      setPdfFile(null);
      return;
    }

    setPdfFile(file);
  };

  const uploadPdfIfNeeded = async () => {
    if (!pdfFile) return form.document_url;

    if (!participant?.id) {
      throw new Error('No se pudo identificar al participante.');
    }

    setUploadingPdf(true);

    try {
      const fileExt = pdfFile.name.split('.').pop() || 'pdf';
      const fileName = `profesionales/${participant.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('project_pdfs')
        .upload(fileName, pdfFile, {
          upsert: false,
          contentType: 'application/pdf',
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('project_pdfs')
        .getPublicUrl(fileName);

      if (!urlData.publicUrl) {
        throw new Error('No se pudo obtener la URL pública del documento.');
      }

      return urlData.publicUrl;
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleReplyConversation = async (
    conversation: ProfessionalConversation
  ) => {
    const reply = String(replyDrafts[conversation.thread_key] || '').trim();

    setReplyError((prev) => ({ ...prev, [conversation.thread_key]: '' }));
    setReplySuccess((prev) => ({ ...prev, [conversation.thread_key]: '' }));

    if (reply.length < 10) {
      setReplyError((prev) => ({
        ...prev,
        [conversation.thread_key]:
          'La respuesta debe tener al menos 10 caracteres.',
      }));
      return;
    }

    const deviceId = getDeviceId();

    if (!deviceId) {
      setReplyError((prev) => ({
        ...prev,
        [conversation.thread_key]:
          'No se pudo identificar tu sesión. Inicia sesión nuevamente.',
      }));
      return;
    }

    setReplyLoadingKey(conversation.thread_key);

    try {
      const res = await fetch('/api/espacio-emprendedor/profesionales/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          thread_key: conversation.thread_key,
          receiver_participant_id: conversation.other_participant_id,
          content: reply,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo enviar la respuesta.');
      }

      setReplyDrafts((prev) => ({ ...prev, [conversation.thread_key]: '' }));
      setReplySuccess((prev) => ({
        ...prev,
        [conversation.thread_key]:
          data?.message || 'Respuesta enviada correctamente.',
      }));

      await loadProfessionalMessages();
    } catch (err: any) {
      setReplyError((prev) => ({
        ...prev,
        [conversation.thread_key]:
          err.message || 'No se pudo enviar la respuesta.',
      }));
    } finally {
      setReplyLoadingKey(null);
    }
  };

  const handlePublishTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrainingError(null);
    setTrainingSuccess(null);

    if (!existingProfile) {
      setTrainingError(
        'Primero debes guardar tu ficha profesional activa antes de publicar capacitación gratuita.'
      );
      return;
    }

    if (!trainingForm.title.trim() || trainingForm.title.trim().length < 4) {
      setTrainingError('Debes indicar un título válido para la capacitación.');
      return;
    }

    if (!trainingForm.category) {
      setTrainingError('Debes seleccionar una categoría.');
      return;
    }

    if (!trainingForm.resource_type) {
      setTrainingError('Debes seleccionar el tipo de recurso.');
      return;
    }

    if (
      !trainingForm.resource_url.trim().startsWith('http://') &&
      !trainingForm.resource_url.trim().startsWith('https://')
    ) {
      setTrainingError(
        'Debes pegar un enlace válido que empiece con http:// o https://.'
      );
      return;
    }

    const deviceId = getDeviceId();

    if (!deviceId) {
      setTrainingError('No se pudo identificar tu sesión. Inicia sesión nuevamente.');
      return;
    }

    setPublishingTraining(true);

    try {
      const res = await fetch('/api/espacio-emprendedor/capacitaciones/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          title: trainingForm.title,
          description: trainingForm.description,
          category: trainingForm.category,
          resource_type: trainingForm.resource_type,
          resource_url: trainingForm.resource_url,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo publicar la capacitación.');
      }

      setTrainingSuccess(
        data?.message || 'Capacitación gratuita publicada correctamente.'
      );

      setTrainingForm((prev) => ({
        ...prev,
        title: '',
        description: '',
        resource_url: '',
      }));


      await loadMyTrainings();
    } catch (err: any) {
      console.error('Error publicando capacitación:', err);
      setTrainingError(err.message || 'No se pudo publicar la capacitación.');
    } finally {
      setPublishingTraining(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!participant?.id) {
      setError('No se pudo identificar al participante. Inicia sesión nuevamente.');
      return;
    }

    if (!form.public_name.trim()) {
      setError('Debes indicar tu nombre público o nombre profesional.');
      return;
    }

    if (!form.professional_type) {
      setError('Debes seleccionar el tipo de profesional.');
      return;
    }

    if (form.specialties.length === 0) {
      setError('Debes seleccionar al menos una especialidad.');
      return;
    }

    if (form.services.length === 0) {
      setError('Debes seleccionar al menos un servicio ofrecido.');
      return;
    }

    if (!form.service_mode || form.service_mode === 'No especificado') {
      setError(
        'Debes indicar si tu asesoría será gratuita, pagada, mixta o pro bono sujeto a evaluación.'
      );
      return;
    }

    if (!form.document_url && !pdfFile) {
      setError('Debes subir un PDF de respaldo profesional.');
      return;
    }

    if (!form.data_truth_confirmed || !form.terms_accepted) {
      setError('Debes aceptar las declaraciones obligatorias.');
      return;
    }

    setSaving(true);

    try {
      const documentUrl = await uploadPdfIfNeeded();

      const res = await fetch('/api/espacio-emprendedor/profesionales/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: participant.id,
          public_name: form.public_name,
          professional_type: form.professional_type,
          specialties: form.specialties,
          services: form.services,
          department: form.department,
          province: form.province,
          district: form.district,
          attention_mode: form.attention_mode,
          service_mode: form.service_mode,
          service_mode_note: form.service_mode_note,
          educational_activities: form.educational_activities,
          training_categories: form.training_categories,
          experience_summary: form.experience_summary,
          public_message: form.public_message,
          document_url: documentUrl,
          data_truth_confirmed: form.data_truth_confirmed,
          terms_accepted: form.terms_accepted,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo guardar la ficha profesional.');
      }

      setForm((prev) => ({
        ...prev,
        document_url: documentUrl,
      }));

      setPdfFile(null);
      setCodigoProfesional(data.codigo_profesional || null);
      setSuccessMessage(data.message || 'Ficha profesional guardada correctamente.');

      setExistingProfile((prev: any) => ({
        ...(prev || {}),
        public_name: form.public_name,
        professional_type: form.professional_type,
        specialties: form.specialties,
        services: form.services,
        department: form.department,
        province: form.province,
        district: form.district,
        attention_mode: form.attention_mode,
        educational_activities: form.educational_activities,
        training_categories: form.training_categories,
        service_mode: form.service_mode,
        service_mode_note: form.service_mode_note,
        experience_summary: form.experience_summary,
        public_message: form.public_message,
        document_url: documentUrl,
        data_truth_confirmed: form.data_truth_confirmed,
        terms_accepted: form.terms_accepted,
        codigo_profesional: data.codigo_profesional || prev?.codigo_profesional,
      }));

      await loadProfessionalMessages();
    } catch (err: any) {
      console.error('Error guardando ficha profesional:', err);
      setError(err.message || 'No se pudo guardar la ficha profesional.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-600">Cargando ficha profesional...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <h1 className="text-3xl font-bold text-slate-900">
            {existingProfile
              ? 'Editar ficha profesional'
              : 'Registro de profesional asesor'}
          </h1>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/espacio-emprendedor/apoyo/profesionales"
              className="bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition"
            >
              ← Profesionales
            </Link>

            <Link
              href="/espacio-emprendedor/apoyo"
              className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition"
            >
              Centro de Apoyo
            </Link>
          </div>
        </div>

        <section className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm mb-6">
          <p className="text-slate-700 text-lg font-semibold">
            {existingProfile
              ? '✏️ Modifica los datos de tu ficha profesional registrada.'
              : '👩‍💼 Completa tu ficha para aparecer como profesional asesor registrado.'}
          </p>

          <p className="text-slate-600 text-sm mt-3">
            Tu información será declarada por ti y servirá para que emprendedores
            o interesados conozcan tus servicios. Voto Claro no certifica, avala
            ni garantiza servicios profesionales.
          </p>

          {codigoProfesional && (
            <div className="mt-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl p-4">
              <p className="text-sm font-semibold text-emerald-800">
                Código profesional:
              </p>

              <p className="text-2xl font-mono font-bold text-emerald-900 tracking-wider">
                {codigoProfesional}
              </p>

              <p className="text-xs text-emerald-700 mt-1">
                Guarda este código. Identifica tu ficha profesional dentro de la plataforma.
              </p>
            </div>
          )}

          <div className="mt-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Aviso:</strong> Voto Claro no certifica profesionales, no
            garantiza honorarios, resultados, cumplimiento, idoneidad profesional
            ni contratación. Cada usuario debe verificar credenciales, experiencia,
            condiciones y costos antes de contratar.
          </div>
        </section>

        {successMessage && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl text-sm">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border-2 border-slate-300 p-6 shadow-sm space-y-5"
        >
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Nombre público o nombre profesional *
            </label>

            <input
              type="text"
              value={form.public_name}
              onChange={(e) => handleChangeText('public_name', e.target.value)}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              placeholder="Ej: Estudio Legal Cabanillas / Contadora María..."
              required
            />

            <p className="text-xs text-slate-500 mt-1">
              Este nombre podrá mostrarse públicamente en la ficha profesional.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Tipo de profesional *
            </label>

            <select
              value={form.professional_type}
              onChange={(e) =>
                handleChangeText('professional_type', e.target.value)
              }
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              required
            >
              <option value="">Selecciona una opción</option>

              {PROFESSIONAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-2">
              Especialidades *
            </h2>

            <div className="flex flex-wrap gap-2">
              {SPECIALTIES.map((item) => {
                const active = form.specialties.includes(item);

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      handleChangeText(
                        'specialties',
                        toggleValue(form.specialties, item)
                      )
                    }
                    className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                      active
                        ? 'bg-green-700 text-white border-green-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-green-500'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-2">
              Servicios ofrecidos *
            </h2>

            <div className="flex flex-wrap gap-2">
              {SERVICES.map((item) => {
                const active = form.services.includes(item);

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      handleChangeText('services', toggleValue(form.services, item))
                    }
                    className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                      active
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Departamento
              </label>

              <select
                value={form.department}
                onChange={(e) => handleChangeText('department', e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                <option value="">Selecciona</option>

                {DEPARTAMENTOS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Provincia
              </label>

              <input
                type="text"
                value={form.province}
                onChange={(e) => handleChangeText('province', e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                placeholder="Ej: Santa"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Distrito
              </label>

              <input
                type="text"
                value={form.district}
                onChange={(e) => handleChangeText('district', e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                placeholder="Ej: Nuevo Chimbote"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Modalidad de atención
            </label>

            <select
              value={form.attention_mode}
              onChange={(e) => handleChangeText('attention_mode', e.target.value)}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
            >
              {ATTENTION_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4">
            <h2 className="text-sm font-bold text-blue-900 mb-3">
              🎓 Actividades educativas
            </h2>

            <div className="flex flex-wrap gap-2">
              {EDUCATIONAL_ACTIVITIES.map((item) => {
                const active = form.educational_activities.includes(item);

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      handleChangeText(
                        'educational_activities',
                        toggleValue(form.educational_activities, item)
                      )
                    }
                    className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                      active
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-blue-800 mt-3">
              Selecciona las actividades educativas que deseas ofrecer dentro de la plataforma.
            </p>
          </div>

          <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-4">
            <h2 className="text-sm font-bold text-indigo-900 mb-3">
              📚 Categorías de capacitación
            </h2>

            <div className="flex flex-wrap gap-2">
              {TRAINING_CATEGORIES.map((item) => {
                const active = form.training_categories.includes(item);

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      handleChangeText(
                        'training_categories',
                        toggleValue(form.training_categories, item)
                      )
                    }
                    className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                      active
                        ? 'bg-indigo-700 text-white border-indigo-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-500'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-indigo-800 mt-3">
              Estas categorías permitirán clasificar cursos, talleres y contenidos educativos.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
            <h2 className="text-sm font-bold text-emerald-900 mb-2">
              Modalidad económica del servicio *
            </h2>

            <p className="text-xs text-emerald-900 mb-3">
              Indica si brindarás asesoría gratuita, pagada, mixta o pro bono. Esta información será visible para los emprendedores.
            </p>

            <select
              value={form.service_mode}
              onChange={(e) => handleChangeText('service_mode', e.target.value)}
              className="w-full border-2 border-emerald-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none bg-white"
              required
            >
              {SERVICE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>

            <label className="block text-sm font-semibold text-emerald-900 mt-4 mb-1">
              Condiciones del servicio
            </label>

            <textarea
              value={form.service_mode_note}
              onChange={(e) =>
                handleChangeText('service_mode_note', e.target.value)
              }
              rows={3}
              className="w-full border-2 border-emerald-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none bg-white"
              placeholder="Ej: Primera orientación gratuita de 20 minutos. Si requiere revisión completa de contrato, se coordina aparte."
            />

            <p className="text-xs text-emerald-800 mt-2">
              Voto Claro no fija honorarios, no cobra comisiones ni garantiza condiciones económicas. La modalidad es declarada por cada profesional.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Experiencia resumida
            </label>

            <textarea
              value={form.experience_summary}
              onChange={(e) =>
                handleChangeText('experience_summary', e.target.value)
              }
              rows={5}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              placeholder="Resume tu experiencia, áreas de trabajo, años aproximados, proyectos atendidos o enfoque profesional."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Mensaje público para emprendedores
            </label>

            <textarea
              value={form.public_message}
              onChange={(e) => handleChangeText('public_message', e.target.value)}
              rows={3}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              placeholder="Ej: Puedo ayudarte a revisar contratos, ordenar costos o preparar mejor tu proyecto antes de buscar inversión."
            />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              PDF de respaldo profesional *
            </label>

            <input
              type="file"
              accept=".pdf"
              onChange={handlePdfChange}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
            />

            <p className="text-xs text-slate-500 mt-1">
              Máximo 10 MB. Puedes subir CV, presentación profesional, constancia, portafolio o documento de respaldo.
            </p>

            {form.document_url && !pdfFile && (
              <div className="mt-2 rounded-xl border border-green-300 bg-green-50 p-3">
                <p className="text-xs text-green-800 mb-2">
                  Ya existe un PDF cargado para esta ficha. Si subes otro, se reemplazará para esta ficha.
                </p>

                <a
                  href={form.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-semibold text-green-700 underline"
                >
                  Ver PDF actual de respaldo profesional →
                </a>
              </div>
            )}

            {pdfFile && (
              <p className="text-xs text-blue-700 mt-2">
                PDF seleccionado: {pdfFile.name}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-bold text-amber-900 mb-2">
              Declaraciones obligatorias
            </h2>

            <div className="space-y-3 text-sm text-amber-900">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={form.data_truth_confirmed}
                  onChange={(e) =>
                    handleChangeText('data_truth_confirmed', e.target.checked)
                  }
                  className="mt-1"
                />

                <span>
                  Declaro que la información de mi ficha profesional y el documento de respaldo son reales,
                  actualizados y fueron proporcionados bajo mi responsabilidad.
                </span>
              </label>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={form.terms_accepted}
                  onChange={(e) =>
                    handleChangeText('terms_accepted', e.target.checked)
                  }
                  className="mt-1"
                />

                <span>
                  Acepto que Voto Claro no certifica ni garantiza mis servicios, honorarios, resultados,
                  cumplimiento, experiencia ni idoneidad profesional. Cada usuario deberá verificar mi información
                  antes de contratar.
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || uploadingPdf}
            className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
          >
            {saving || uploadingPdf
              ? 'Guardando ficha...'
              : existingProfile
              ? 'Actualizar ficha profesional'
              : 'Registrar ficha profesional'}
          </button>
        </form>

        <section className="mt-6 bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                📚 Mis capacitaciones publicadas
              </h2>

              <p className="text-sm text-slate-600">
                Administra los cursos, talleres, videos, guías o materiales que ya publicaste.
                Puedes corregir el título, cambiar la categoría, actualizar el enlace o desactivar
                una publicación para que deje de mostrarse al público.
              </p>
            </div>

            {existingProfile && (
              <button
                type="button"
                onClick={loadMyTrainings}
                disabled={loadingMyTrainings}
                className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 transition disabled:opacity-50"
              >
                {loadingMyTrainings ? 'Actualizando...' : 'Actualizar lista'}
              </button>
            )}
          </div>

          {!existingProfile ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Primero guarda tu ficha profesional. Después podrás ver y administrar tus
              capacitaciones publicadas.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {trainingActionMessage && (
                <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                  {trainingActionMessage}
                </div>
              )}

              {myTrainingsError && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {myTrainingsError}
                </div>
              )}

              {loadingMyTrainings ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Cargando tus capacitaciones publicadas...
                </div>
              ) : myTrainings.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Todavía no has publicado capacitaciones gratuitas. Usa el formulario inferior
                  para registrar tu primer curso, taller, video o material.
                </div>
              ) : (
                <div className="space-y-4">
                  {myTrainings.map((training) => {
                    const isEditing = editingTrainingId === training.id;
                    const isInactive = training.status === 'inactive';

                    return (
                      <article
                        key={training.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-slate-900">
                              {training.title}
                            </h3>

                            <p className="text-xs text-slate-500 mt-1">
                              {training.category} · {training.resource_type} · Actualizado: {formatDate(training.updated_at)}
                            </p>
                          </div>

                          <span
                            className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold ${getTrainingStatusClass(
                              training.status
                            )}`}
                          >
                            {getTrainingStatusLabel(training.status)}
                          </span>
                        </div>

                        {training.description && (
                          <p className="mt-3 text-sm text-slate-700">
                            {training.description}
                          </p>
                        )}

                        {training.admin_note && (
                          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                            <strong>Nota de administración:</strong> {training.admin_note}
                          </div>
                        )}

                        {training.rejected_reason && (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                            <strong>Observación:</strong> {training.rejected_reason}
                          </div>
                        )}

                        {isEditing ? (
                          <form onSubmit={handleUpdateTraining} className="mt-4 space-y-4 rounded-xl border border-indigo-200 bg-white p-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Título *
                              </label>

                              <input
                                type="text"
                                value={editTrainingForm.title}
                                onChange={(e) => handleEditTrainingChange('title', e.target.value)}
                                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                  Categoría *
                                </label>

                                <select
                                  value={editTrainingForm.category}
                                  onChange={(e) => handleEditTrainingChange('category', e.target.value)}
                                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:outline-none"
                                >
                                  {TRAINING_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                  Tipo de recurso *
                                </label>

                                <select
                                  value={editTrainingForm.resource_type}
                                  onChange={(e) => handleEditTrainingChange('resource_type', e.target.value)}
                                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:outline-none"
                                >
                                  {TRAINING_RESOURCE_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Enlace gratuito *
                              </label>

                              <input
                                type="url"
                                value={editTrainingForm.resource_url}
                                onChange={(e) => handleEditTrainingChange('resource_url', e.target.value)}
                                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Descripción breve
                              </label>

                              <textarea
                                value={editTrainingForm.description}
                                onChange={(e) => handleEditTrainingChange('description', e.target.value)}
                                rows={3}
                                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2">
                              <button
                                type="submit"
                                disabled={updatingTraining}
                                className="flex-1 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 transition disabled:opacity-50"
                              >
                                {updatingTraining ? 'Guardando cambios...' : 'Guardar cambios'}
                              </button>

                              <button
                                type="button"
                                onClick={handleCancelEditTraining}
                                disabled={updatingTraining}
                                className="flex-1 rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300 transition disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="mt-4 flex flex-col sm:flex-row gap-2">
                            <a
                              href={training.resource_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 rounded-xl bg-blue-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-800 transition"
                            >
                              Ver recurso →
                            </a>

                            <button
                              type="button"
                              onClick={() => handleStartEditTraining(training)}
                              className="flex-1 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 transition"
                            >
                              Editar
                            </button>

                            {!isInactive && (
                              <button
                                type="button"
                                onClick={() => handleDeactivateTraining(training)}
                                disabled={deactivatingTrainingId === training.id}
                                className="flex-1 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition disabled:opacity-50"
                              >
                                {deactivatingTrainingId === training.id
                                  ? 'Desactivando...'
                                  : 'Desactivar'}
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-6 bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            🎓 Publicar capacitación gratuita
          </h2>

          <p className="text-sm text-slate-600">
            Aquí puedes registrar enlaces gratuitos a cursos, talleres, webinars,
            videos, guías o materiales educativos. El recurso debe estar publicado
            en una plataforma externa como YouTube, Facebook, Google Drive, OneDrive,
            una web propia u otro enlace público.
          </p>

          {!existingProfile ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Primero guarda tu ficha profesional. Después podrás publicar enlaces
              de capacitación gratuita asociados a tu perfil profesional.
            </div>
          ) : (
            <form onSubmit={handlePublishTraining} className="mt-5 space-y-4">
              {trainingSuccess && (
                <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                  {trainingSuccess}
                </div>
              )}

              {trainingError && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {trainingError}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Título del curso, taller, video o material *
                </label>

                <input
                  type="text"
                  value={trainingForm.title}
                  onChange={(e) => handleTrainingChange('title', e.target.value)}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none"
                  placeholder="Ej: Curso básico de costos para emprendedores"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Categoría *
                  </label>

                  <select
                    value={trainingForm.category}
                    onChange={(e) =>
                      handleTrainingChange('category', e.target.value)
                    }
                    className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none"
                  >
                    {TRAINING_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Tipo de recurso *
                  </label>

                  <select
                    value={trainingForm.resource_type}
                    onChange={(e) =>
                      handleTrainingChange('resource_type', e.target.value)
                    }
                    className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none"
                  >
                    {TRAINING_RESOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Enlace gratuito del recurso *
                </label>

                <input
                  type="url"
                  value={trainingForm.resource_url}
                  onChange={(e) =>
                    handleTrainingChange('resource_url', e.target.value)
                  }
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none"
                  placeholder="https://youtube.com/... o https://drive.google.com/..."
                />

                <p className="text-xs text-slate-500 mt-1">
                  Por ahora se aceptan enlaces externos. Si deseas compartir un PDF,
                  súbelo primero a Google Drive, OneDrive u otra plataforma y pega aquí el enlace público.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Descripción breve
                </label>

                <textarea
                  value={trainingForm.description}
                  onChange={(e) =>
                    handleTrainingChange('description', e.target.value)
                  }
                  rows={3}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none"
                  placeholder="Explica qué aprenderá el emprendedor y para quién está dirigido este material."
                />
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>⚠️ Aviso:</strong> Publica únicamente enlaces permitidos,
                gratuitos y relacionados con capacitación emprendedora. No publiques
                información engañosa, contenido ofensivo, enlaces inseguros ni material
                sobre el que no tengas derecho a compartir.
              </div>

              <button
                type="submit"
                disabled={publishingTraining}
                className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold hover:bg-blue-800 transition disabled:opacity-50"
              >
                {publishingTraining
                  ? 'Publicando capacitación...'
                  : 'Publicar capacitación gratuita'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
