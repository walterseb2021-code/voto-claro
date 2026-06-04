'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

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

const INVESTOR_TYPES = [
  'Persona natural',
  'Empresa',
  'Fondo o grupo de inversión',
  'Asociación / Cooperativa',
  'Comprador estratégico',
  'Mentor inversionista',
];

const SUPPORT_TYPES = [
  'Capital',
  'Préstamo',
  'Compra anticipada',
  'Alianza comercial',
  'Mentoría',
  'Contactos comerciales',
  'Distribución',
];

const PROJECT_STAGES = [
  'Idea inicial',
  'Prototipo',
  'Negocio funcionando',
  'Expansión',
  'Exportación',
];

const PARTICIPATION_STYLES = [
  'Solo evaluar proyectos',
  'Invertir si el proyecto convence',
  'Participar como socio',
  'Comprar productos o servicios',
  'Ofrecer mentoría',
  'Buscar alianzas comerciales',
];

const INVESTMENT_HORIZONS = [
  'Corto plazo',
  'Mediano plazo',
  'Largo plazo',
];

const RISK_LEVELS = [
  'Bajo',
  'Medio',
  'Alto',
];

function parseMoney(value: string): number | null {
  const clean = value.trim();

  if (!clean) return null;

  const parsed = Number(clean);

  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed);
}

function toggleArrayValue(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

export default function PerfilInversionistaPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [participant, setParticipant] = useState<any>(null);
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [perfil, setPerfil] = useState({
    company: '',
    investment_range_min: '',
    investment_range_max: '',
    categories: [] as string[],
    departments: [] as string[],
    notify_email: false,
    monto_mayor: false,

    investor_type: '',
    support_types: [] as string[],
    project_stages: [] as string[],
    participation_style: '',
    investment_horizon: '',
    risk_level: '',
    public_message: '',
  });

  const [showCategories, setShowCategories] = useState(false);
  const [showDepartments, setShowDepartments] = useState(false);
  const [showSupportTypes, setShowSupportTypes] = useState(false);
  const [showProjectStages, setShowProjectStages] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    const deviceId = localStorage.getItem('vc_device_id');

    if (!deviceId) {
      router.push('/proyecto-ciudadano/registro');
      return;
    }

    try {
      const { data: participantData, error: participantError } = await supabase
        .from('project_participants')
        .select('id, alias, device_id')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (participantError || !participantData) {
        router.push('/proyecto-ciudadano/registro');
        return;
      }

      setParticipant(participantData);

      const { data: perfilData, error: perfilError } = await supabase
        .from('espacio_inversionistas')
        .select(`
          id,
          participant_id,
          company,
          investment_range_min,
          investment_range_max,
          categories,
          departments,
          notify_email,
          investor_type,
          support_types,
          project_stages,
          participation_style,
          investment_horizon,
          risk_level,
          public_message
        `)
        .eq('participant_id', participantData.id)
        .maybeSingle();

      if (perfilError) {
        throw perfilError;
      }

      if (perfilData) {
        setExistingProfileId(perfilData.id);

        setPerfil({
          company: perfilData.company || '',
          investment_range_min: perfilData.investment_range_min?.toString() || '',
          investment_range_max:
            perfilData.investment_range_max && perfilData.investment_range_max <= 100000
              ? perfilData.investment_range_max.toString()
              : '',
          categories: perfilData.categories || [],
          departments: perfilData.departments || [],
          notify_email: perfilData.notify_email || false,
          monto_mayor: (perfilData.investment_range_max || 0) > 100000,

          investor_type: perfilData.investor_type || '',
          support_types: perfilData.support_types || [],
          project_stages: perfilData.project_stages || [],
          participation_style: perfilData.participation_style || '',
          investment_horizon: perfilData.investment_horizon || '',
          risk_level: perfilData.risk_level || '',
          public_message: perfilData.public_message || '',
        });
      }
    } catch (err) {
      console.error('Error cargando perfil inversionista:', err);
      setError('No se pudo cargar tu perfil inversionista. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    if (category === 'Todas') {
      const todas = CATEGORIAS.filter((c) => c !== 'Todas');

      setPerfil((prev) => ({
        ...prev,
        categories: prev.categories.length === todas.length ? [] : todas,
      }));

      return;
    }

    setPerfil((prev) => ({
      ...prev,
      categories: toggleArrayValue(prev.categories, category),
    }));
  };

  const toggleDepartment = (department: string) => {
    if (department === 'Todos') {
      const todos = DEPARTAMENTOS.filter((d) => d !== 'Todos');

      setPerfil((prev) => ({
        ...prev,
        departments: prev.departments.length === todos.length ? [] : todos,
      }));

      return;
    }

    setPerfil((prev) => ({
      ...prev,
      departments: toggleArrayValue(prev.departments, department),
    }));
  };

  const toggleSupportType = (supportType: string) => {
    setPerfil((prev) => ({
      ...prev,
      support_types: toggleArrayValue(prev.support_types, supportType),
    }));
  };

  const toggleProjectStage = (stage: string) => {
    setPerfil((prev) => ({
      ...prev,
      project_stages: toggleArrayValue(prev.project_stages, stage),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setError(null);
    setMessage(null);

    if (!participant?.id) {
      setError('No se pudo identificar tu sesión. Vuelve a iniciar sesión con tu código de acceso.');
      setSaving(false);
      return;
    }

    const minValue = parseMoney(perfil.investment_range_min);

    let maxValue: number | null = null;

    if (perfil.monto_mayor) {
      maxValue = 999999;
    } else {
      maxValue = parseMoney(perfil.investment_range_max);
    }

    if (perfil.investment_range_min.trim() && minValue == null) {
      setError('La inversión mínima debe ser un número válido mayor que cero.');
      setSaving(false);
      return;
    }

    if (!perfil.monto_mayor && perfil.investment_range_max.trim() && maxValue == null) {
      setError('La inversión máxima debe ser un número válido mayor que cero.');
      setSaving(false);
      return;
    }

    if (minValue != null && maxValue != null && maxValue < minValue) {
      setError('La inversión máxima no puede ser menor que la inversión mínima.');
      setSaving(false);
      return;
    }

    if (!perfil.investor_type) {
      setError('Selecciona el tipo de inversionista.');
      setSaving(false);
      return;
    }

    if (perfil.support_types.length === 0) {
      setError('Selecciona al menos un tipo de apoyo que podrías ofrecer.');
      setSaving(false);
      return;
    }

    if (perfil.project_stages.length === 0) {
      setError('Selecciona al menos una etapa de proyecto de tu interés.');
      setSaving(false);
      return;
    }

    if (!perfil.participation_style) {
      setError('Selecciona tu forma de participación preferida.');
      setSaving(false);
      return;
    }

    if (!perfil.investment_horizon) {
      setError('Selecciona tu horizonte de interés.');
      setSaving(false);
      return;
    }

    if (!perfil.risk_level) {
      setError('Selecciona tu nivel de riesgo referencial.');
      setSaving(false);
      return;
    }

    if (perfil.public_message.trim().length > 300) {
      setError('El mensaje público no debe superar los 300 caracteres.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        participant_id: participant.id,
        company: perfil.company.trim() || null,
        investment_range_min: minValue,
        investment_range_max: maxValue,
        categories: perfil.categories,
        departments: perfil.departments,
        notify_email: perfil.notify_email,

        investor_type: perfil.investor_type || null,
        support_types: perfil.support_types,
        project_stages: perfil.project_stages,
        participation_style: perfil.participation_style || null,
        investment_horizon: perfil.investment_horizon || null,
        risk_level: perfil.risk_level || null,
        public_message: perfil.public_message.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data: currentProfile, error: currentError } = await supabase
        .from('espacio_inversionistas')
        .select('id')
        .eq('participant_id', participant.id)
        .maybeSingle();

      if (currentError) throw currentError;

      if (currentProfile?.id) {
        const { error: updateError } = await supabase
          .from('espacio_inversionistas')
          .update(payload)
          .eq('id', currentProfile.id);

        if (updateError) throw updateError;

        setExistingProfileId(currentProfile.id);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('espacio_inversionistas')
          .insert(payload)
          .select('id')
          .single();

        if (insertError) throw insertError;

        setExistingProfileId(inserted.id);
      }

      setMessage('✅ Perfil guardado correctamente. Tus preferencias fueron actualizadas.');
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error('Error guardando perfil inversionista:', err);

      const rawMessage = String(err?.message || '');

      if (
        rawMessage.includes('duplicate key') ||
        rawMessage.includes('unique_participant_investor')
      ) {
        setError(
          'Ya tienes un perfil inversionista registrado. Recarga la página y vuelve a guardar tus preferencias.'
        );
      } else {
        setError('No se pudo guardar el perfil. Revisa los datos e intenta nuevamente.');
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const visibleParts: string[] = [];

    const companyValue = perfil.company.trim();
    const minValue = perfil.investment_range_min.trim();
    const maxValue = perfil.investment_range_max.trim();
    const publicMessageValue = perfil.public_message.trim();

    const activeSection = loading
      ? 'perfil-inversionista-cargando'
      : error
      ? 'perfil-inversionista-error'
      : 'perfil-inversionista-formulario';

    const activeViewId = loading
      ? 'loading-profile'
      : error
      ? 'error-profile'
      : saving
      ? 'saving-profile'
      : message
      ? 'saved-profile'
      : 'investor-profile-form';

    const activeViewTitle = loading
      ? 'Perfil inversionista cargando'
      : error
      ? 'Perfil inversionista con error'
      : saving
      ? 'Guardando perfil inversionista'
      : message
      ? 'Perfil inversionista guardado'
      : 'Formulario del perfil inversionista';

    if (loading) {
      visibleParts.push('La pantalla está cargando el perfil del inversionista.');
    }

    visibleParts.push(`Vista activa: ${activeViewTitle}.`);
    visibleParts.push('Pantalla visible: Perfil inversionista del Espacio Emprendedor.');
    visibleParts.push('Esta pantalla permite crear o actualizar un único perfil inversionista por participante.');
    visibleParts.push('Voto Claro no garantiza inversión, financiamiento, rentabilidad, contacto efectivo ni cierre de acuerdos.');

    if (participant && !loading) {
      visibleParts.push('Hay un participante con sesión activa, sin exponer datos personales completos al asistente.');
    }

    if (!participant && !loading) {
      visibleParts.push('No hay participante válido cargado en esta pantalla.');
    }

    if (existingProfileId) {
      visibleParts.push('Ya existe un perfil inversionista asociado al participante; esta pantalla permite actualizarlo.');
    } else {
      visibleParts.push('Todavía no se confirma un perfil inversionista existente; al guardar se creará uno nuevo.');
    }

    if (companyValue) {
      visibleParts.push('Hay empresa u organización escrita, sin exponerla completa al asistente.');
    } else {
      visibleParts.push('No hay empresa u organización escrita todavía.');
    }

    if (minValue) {
      visibleParts.push('Hay monto mínimo referencial configurado.');
    } else {
      visibleParts.push('No hay monto mínimo visible todavía.');
    }

    if (perfil.monto_mayor) {
      visibleParts.push('Está marcada la opción de montos mayores a S/ 100000.');
    } else if (maxValue) {
      visibleParts.push('Hay monto máximo referencial configurado.');
    } else {
      visibleParts.push('No hay monto máximo visible todavía.');
    }

    if (perfil.investor_type) {
      visibleParts.push(`Tipo de inversionista seleccionado: ${perfil.investor_type}.`);
    } else {
      visibleParts.push('No hay tipo de inversionista seleccionado todavía.');
    }

    visibleParts.push(`Tipos de apoyo seleccionados: ${perfil.support_types.length}.`);
    visibleParts.push(`Etapas de proyecto seleccionadas: ${perfil.project_stages.length}.`);

    if (perfil.participation_style) {
      visibleParts.push(`Forma de participación seleccionada: ${perfil.participation_style}.`);
    } else {
      visibleParts.push('No hay forma de participación seleccionada todavía.');
    }

    if (perfil.investment_horizon) {
      visibleParts.push(`Horizonte de interés seleccionado: ${perfil.investment_horizon}.`);
    } else {
      visibleParts.push('No hay horizonte de interés seleccionado todavía.');
    }

    if (perfil.risk_level) {
      visibleParts.push(`Nivel de riesgo referencial seleccionado: ${perfil.risk_level}.`);
    } else {
      visibleParts.push('No hay nivel de riesgo seleccionado todavía.');
    }

    if (perfil.categories.length) {
      visibleParts.push(`Cantidad de categorías seleccionadas: ${perfil.categories.length}.`);
    } else {
      visibleParts.push('No hay categorías seleccionadas todavía.');
    }

    if (perfil.departments.length) {
      visibleParts.push(`Cantidad de departamentos seleccionados: ${perfil.departments.length}.`);
    } else {
      visibleParts.push('No hay departamentos seleccionados todavía.');
    }

    if (publicMessageValue) {
      visibleParts.push('Hay un mensaje público breve escrito, sin exponer su contenido completo al asistente.');
    } else {
      visibleParts.push('No hay mensaje público escrito todavía.');
    }

    visibleParts.push(
      perfil.notify_email
        ? 'Las notificaciones por correo están activadas.'
        : 'Las notificaciones por correo están desactivadas.'
    );

    if (saving) {
      visibleParts.push('El perfil del inversionista se está guardando.');
    }

    if (message) {
      visibleParts.push(`Mensaje de éxito visible: ${message}`);
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}`);
    }

    const availableActions = [
      'Editar empresa',
      'Editar rango de inversión referencial',
      'Seleccionar tipo de inversionista',
      'Seleccionar tipos de apoyo',
      'Seleccionar etapas de proyecto',
      'Seleccionar forma de participación',
      'Seleccionar horizonte de interés',
      'Seleccionar riesgo referencial',
      'Seleccionar categorías',
      'Seleccionar departamentos',
      'Guardar perfil',
      'Volver',
    ];

    const summary = loading
      ? 'Pantalla del perfil inversionista cargando datos.'
      : error
      ? 'Pantalla del perfil inversionista con error visible.'
      : 'Pantalla para crear o actualizar preferencias del inversionista y recibir proyectos compatibles.';

    const speakableSummary = loading
      ? 'Estamos en el perfil inversionista del Espacio Emprendedor y la pantalla está cargando tus datos.'
      : error
      ? 'Estamos en el perfil inversionista del Espacio Emprendedor, pero esta pantalla muestra un error.'
      : 'Estamos en tu perfil inversionista del Espacio Emprendedor. Aquí puedes configurar tu rango referencial, tipo de inversionista, formas de apoyo, etapas de interés, categorías, departamentos y notificaciones. Recuerda que Voto Claro no garantiza inversión, financiamiento ni rentabilidad.';

    const status = loading ? 'loading' : error ? 'error' : 'ready';

    setPageContext({
      pageId: 'espacio-emprendedor-perfil-inversionista',
      pageTitle: 'Espacio Emprendedor',
      route: '/espacio-emprendedor/perfil-inversionista',
      summary,
      speakableSummary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Espacio Emprendedor', 'Perfil inversionista', activeViewTitle],
      visibleSections: [
        'empresa',
        'rango-inversion-referencial',
        'tipo-inversionista',
        'tipos-apoyo',
        'etapas-proyecto',
        'forma-participacion',
        'horizonte-interes',
        'riesgo-referencial',
        'categorias',
        'departamentos',
        'mensaje-publico',
        'notificaciones',
        'guardado',
      ],
      suggestedPrompts: [
        {
          id: 'ee-investor-1',
          label: '¿Qué me falta?',
          question: '¿Qué me falta completar en este perfil inversionista?',
        },
        {
          id: 'ee-investor-2',
          label: '¿Qué apoyo ofrezco?',
          question: '¿Cuántos tipos de apoyo tengo seleccionados en esta pantalla?',
        },
        {
          id: 'ee-investor-3',
          label: '¿Qué etapas busco?',
          question: '¿Cuántas etapas de proyecto tengo seleccionadas en esta pantalla?',
        },
        {
          id: 'ee-investor-4',
          label: '¿Tengo correo activado?',
          question: '¿Las notificaciones por correo están activadas en esta pantalla?',
        },
        {
          id: 'ee-investor-5',
          label: '¿Ya está guardado?',
          question: '¿Mi perfil inversionista ya está guardado o se está guardando en esta pantalla?',
        },
      ],
      visibleActions: availableActions,
      visibleText: visibleParts.join('\n'),
      availableActions,
      selectedItemTitle: existingProfileId ? 'Perfil inversionista existente' : 'Nuevo perfil inversionista',
      status,
      dynamicData: {
        participantLogueado: !!participant,
        participantDataProtected: true,
        existingProfile: !!existingProfileId,
        savingProfile: saving,
        companyProtected: !!companyValue,
        investmentRangeMinProtected: !!minValue,
        investmentRangeMaxProtected: perfil.monto_mayor ? 'mayor-a-100000' : !!maxValue,
        montoMayor: perfil.monto_mayor,
        investorType: perfil.investor_type || '',
        supportTypesCount: perfil.support_types.length,
        projectStagesCount: perfil.project_stages.length,
        participationStyle: perfil.participation_style || '',
        investmentHorizon: perfil.investment_horizon || '',
        riskLevel: perfil.risk_level || '',
        categoriesCount: perfil.categories.length,
        departmentsCount: perfil.departments.length,
        publicMessageProtected: !!publicMessageValue,
        notifyEmail: perfil.notify_email,
        saveMessageVisible: message || '',
        errorMessageVisible: error || '',
        canSaveProfile: !!participant,
        investmentDisclaimer:
          'Voto Claro no garantiza inversión, financiamiento, rentabilidad, contacto efectivo ni cierre de acuerdos.',
      },
    });
  }, [setPageContext, loading, saving, message, error, participant, perfil, existingProfileId]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Mi perfil inversionista</h1>

          <Link href="/espacio-emprendedor" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <p className="text-slate-600 mb-4 text-sm">
            Configura o actualiza tus preferencias para recibir proyectos compatibles y mostrar a los emprendedores qué tipo de contacto buscas.
          </p>

          <div className="mb-4 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> Este perfil no constituye oferta pública de inversión, asesoría financiera ni compromiso de financiamiento.
            Voto Claro no garantiza inversión, rentabilidad, contacto efectivo ni cierre de acuerdos. Todo contacto posterior será responsabilidad de las partes.
          </div>

          {message && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl text-sm">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Empresa / Organización / Nombre comercial (opcional)
              </label>

              <input
                type="text"
                value={perfil.company}
                onChange={(e) => setPerfil({ ...perfil, company: e.target.value })}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                placeholder="Ej: Inversiones ABC"
              />

              <p className="text-xs text-slate-500 mt-1">
                Este dato ayuda al emprendedor a identificar mejor el tipo de interesado.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Inversión mínima referencial (S/)
                </label>

                <input
                  type="number"
                  min="1"
                  value={perfil.investment_range_min}
                  onChange={(e) =>
                    setPerfil({ ...perfil, investment_range_min: e.target.value })
                  }
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 5000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Inversión máxima referencial (S/)
                </label>

                <input
                  type="number"
                  min="1"
                  value={perfil.investment_range_max}
                  onChange={(e) =>
                    setPerfil({ ...perfil, investment_range_max: e.target.value })
                  }
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                  placeholder="Ej: 100000"
                  max={100000}
                  disabled={perfil.monto_mayor}
                />

                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="monto_mayor"
                    checked={perfil.monto_mayor}
                    onChange={(e) =>
                      setPerfil({
                        ...perfil,
                        monto_mayor: e.target.checked,
                        investment_range_max: e.target.checked ? '' : perfil.investment_range_max,
                      })
                    }
                  />

                  <label htmlFor="monto_mayor" className="text-sm text-slate-600">
                    Busco proyectos con montos mayores a S/ 100000
                  </label>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Estos montos son referenciales. No generan obligación de inversión ni compromiso financiero.
            </p>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Tipo de inversionista *
              </label>

              <select
                value={perfil.investor_type}
                onChange={(e) => setPerfil({ ...perfil, investor_type: e.target.value })}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                <option value="">Selecciona una opción</option>
                {INVESTOR_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSupportTypes((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    Tipo de apoyo que podrías ofrecer *
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {perfil.support_types.length
                      ? `${perfil.support_types.length} seleccionado(s)`
                      : 'Ninguno seleccionado todavía'}
                  </div>
                </div>

                <span className="text-lg text-slate-600">
                  {showSupportTypes ? '▾' : '▸'}
                </span>
              </button>

              {showSupportTypes ? (
                <div className="p-4 border-t border-slate-200">
                  <div className="flex flex-wrap gap-2">
                    {SUPPORT_TYPES.map((item) => {
                      const active = perfil.support_types.includes(item);

                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleSupportType(item)}
                          className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                            active
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500'
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowProjectStages((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    Etapas de proyecto de interés *
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {perfil.project_stages.length
                      ? `${perfil.project_stages.length} seleccionada(s)`
                      : 'Ninguna seleccionada todavía'}
                  </div>
                </div>

                <span className="text-lg text-slate-600">
                  {showProjectStages ? '▾' : '▸'}
                </span>
              </button>

              {showProjectStages ? (
                <div className="p-4 border-t border-slate-200">
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_STAGES.map((item) => {
                      const active = perfil.project_stages.includes(item);

                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleProjectStage(item)}
                          className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                            active
                              ? 'bg-purple-700 text-white border-purple-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-purple-500'
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Forma de participación preferida *
              </label>

              <select
                value={perfil.participation_style}
                onChange={(e) => setPerfil({ ...perfil, participation_style: e.target.value })}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
              >
                <option value="">Selecciona una opción</option>
                {PARTICIPATION_STYLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Horizonte de interés *
                </label>

                <select
                  value={perfil.investment_horizon}
                  onChange={(e) => setPerfil({ ...perfil, investment_horizon: e.target.value })}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                >
                  <option value="">Selecciona una opción</option>
                  {INVESTMENT_HORIZONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Nivel de riesgo referencial *
                </label>

                <select
                  value={perfil.risk_level}
                  onChange={(e) => setPerfil({ ...perfil, risk_level: e.target.value })}
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                >
                  <option value="">Selecciona una opción</option>
                  {RISK_LEVELS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCategories((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    Categorías de interés
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {perfil.categories.length
                      ? `${perfil.categories.length} seleccionada(s)`
                      : 'Ninguna seleccionada todavía'}
                  </div>
                </div>

                <span className="text-lg text-slate-600">
                  {showCategories ? '▾' : '▸'}
                </span>
              </button>

              {showCategories ? (
                <div className="p-4 border-t border-slate-200">
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS.map((category) => {
                      const active =
                        category === 'Todas'
                          ? perfil.categories.length ===
                            CATEGORIAS.filter((c) => c !== 'Todas').length
                          : perfil.categories.includes(category);

                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                            active
                              ? 'bg-green-700 text-white border-green-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-green-500'
                          }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDepartments((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    Departamentos de interés
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {perfil.departments.length
                      ? `${perfil.departments.length} seleccionado(s)`
                      : 'Ninguno seleccionado todavía'}
                  </div>
                </div>

                <span className="text-lg text-slate-600">
                  {showDepartments ? '▾' : '▸'}
                </span>
              </button>

              {showDepartments ? (
                <div className="p-4 border-t border-slate-200">
                  <div className="flex flex-wrap gap-2">
                    {DEPARTAMENTOS.map((department) => {
                      const active =
                        department === 'Todos'
                          ? perfil.departments.length ===
                            DEPARTAMENTOS.filter((d) => d !== 'Todos').length
                          : perfil.departments.includes(department);

                      return (
                        <button
                          key={department}
                          type="button"
                          onClick={() => toggleDepartment(department)}
                          className={`px-3 py-2 rounded-full text-sm font-semibold border ${
                            active
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
                          }`}
                        >
                          {department}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Mensaje público breve para emprendedores
              </label>

              <textarea
                value={perfil.public_message}
                onChange={(e) => setPerfil({ ...perfil, public_message: e.target.value })}
                rows={3}
                maxLength={300}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                placeholder="Ej: Busco proyectos con ventas iniciales, enfoque regional y posibilidad de alianza comercial."
              />

              <p className="text-xs text-slate-500 mt-1">
                Máximo 300 caracteres. No incluyas datos sensibles ni promesas de inversión.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify_email"
                checked={perfil.notify_email}
                onChange={(e) =>
                  setPerfil({ ...perfil, notify_email: e.target.checked })
                }
              />

              <label htmlFor="notify_email" className="text-sm text-slate-700">
                Recibir notificaciones por correo cuando aparezcan proyectos compatibles
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-green-700 text-white px-5 py-3 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : existingProfileId ? 'Actualizar perfil' : 'Guardar perfil'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}