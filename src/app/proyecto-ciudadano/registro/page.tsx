'use client';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

// Función para obtener o crear device_id
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  return newId;
}

// Función para generar código de acceso
async function generarCodigoAcceso(): Promise<string> {
  const { data, error } = await supabase.rpc('generar_codigo_acceso');
  if (error) throw error;
  return data;
}

// Componente interno que usa useSearchParams
function RegistroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const returnTo = searchParams.get('returnTo');
  const normalizedReturnTo = (returnTo || '').trim();
  const [deviceId, setDeviceId] = useState<string>("");
  const [form, setForm] = useState({
    full_name: '',
    dni: '',
    email: '',
    phone: '',
    address: '',
    district: '',
    alias: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [codigoAcceso, setCodigoAcceso] = useState<string | null>(null);

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!form.full_name || !form.dni || !form.email || !form.phone || !form.alias || !form.address || !form.district) {
      setError('Todos los campos son obligatorios.');
      setLoading(false);
      return;
    }

    if (form.dni.length !== 8) {
      setError('El DNI debe tener 8 dígitos.');
      setLoading(false);
      return;
    }

    if (!form.email.includes('@')) {
      setError('Correo electrónico inválido.');
      setLoading(false);
      return;
    }

    if (!deviceId) {
      setError('No se pudo identificar tu dispositivo. Recarga la página.');
      setLoading(false);
      return;
    }

    try {
      // Generar código de acceso
      const codigo = await generarCodigoAcceso();

      const { data, error } = await supabase
        .from('project_participants')
        .insert({
          full_name: form.full_name,
          dni: form.dni,
          email: form.email,
          phone: form.phone,
          address: form.address,
          district: form.district,
          alias: form.alias,
          device_id: deviceId,
          codigo_acceso: codigo,
        })
        .select()
        .single();

      if (error) throw error;

      setCodigoAcceso(codigo);
      setSuccess(true);
    } catch (err: any) {
      if (err.message?.includes('duplicate key') || err.code === '23505') {
        setError('Ya existe un participante con este DNI o correo. Si ya te registraste, intenta iniciar sesión con tu código de acceso.');
      } else {
        setError(err.message || 'Error al registrar. Intenta nuevamente.');
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    const normalizedReturnTo = (returnTo || '').trim();

    const destinationLabel =
  normalizedReturnTo === 'espacio-emprendedor'
    ? 'Espacio Emprendedor'
    : normalizedReturnTo === 'comentarios'
    ? 'Comentarios Ciudadanos'
    : normalizedReturnTo === '/reto-ciudadano' || normalizedReturnTo === 'reto-ciudadano'
    ? 'Reto Ciudadano'
    : normalizedReturnTo === '/reto-ciudadano/principal' || normalizedReturnTo === 'reto-ciudadano/principal'
    ? 'Reto Ciudadano'
    : normalizedReturnTo === '/reto-ciudadano/camino' || normalizedReturnTo === 'reto-ciudadano/camino'
    ? 'Reto Ciudadano'
    : 'Proyecto Ciudadano';

    const filledFields = [
      form.full_name ? 'nombres completos' : null,
      form.dni ? 'DNI' : null,
      form.email ? 'correo electrónico' : null,
      form.phone ? 'celular' : null,
      form.alias ? 'alias' : null,
      form.address ? 'dirección' : null,
      form.district ? 'distrito' : null,
    ].filter(Boolean) as string[];

    const missingFields = [
      !form.full_name ? 'nombres completos' : null,
      !form.dni ? 'DNI' : null,
      !form.email ? 'correo electrónico' : null,
      !form.phone ? 'celular' : null,
      !form.alias ? 'alias' : null,
      !form.address ? 'dirección' : null,
      !form.district ? 'distrito' : null,
    ].filter(Boolean) as string[];

    const activeSection = success
      ? 'registro-exitoso'
      : loading
      ? 'registro-enviando'
      : 'formulario-registro';

    const activeViewId = success
      ? 'success'
      : loading
      ? 'submitting'
      : 'form';

    const activeViewTitle = success
      ? 'Registro completado'
      : loading
      ? 'Enviando registro'
      : 'Formulario de registro';

    const visibleParts: string[] = [];

    if (success) {
      visibleParts.push('El registro ya fue completado exitosamente.');
      if (codigoAcceso) {
        visibleParts.push(`Código de acceso visible: ${codigoAcceso}.`);
      }
      visibleParts.push(`La acción visible de continuación lleva a ${destinationLabel}.`);
    } else {
      visibleParts.push('Está visible el formulario de registro de participante.');
      if (filledFields.length) {
        visibleParts.push(`Campos con contenido: ${filledFields.join(', ')}.`);
      }
      if (missingFields.length) {
        visibleParts.push(`Campos faltantes: ${missingFields.join(', ')}.`);
      }
      if (form.dni) {
        visibleParts.push(`DNI escrito: ${form.dni}.`);
      }
      if (form.email) {
        visibleParts.push(`Correo escrito: ${form.email}.`);
      }
      if (form.alias) {
        visibleParts.push(`Alias escrito: ${form.alias}.`);
      }
      visibleParts.push(`La acción de volver regresa a ${destinationLabel}.`);
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}.`);
    }

    if (loading) {
      visibleParts.push('El registro se está procesando en este momento.');
    }

    if (deviceId) {
      visibleParts.push('El dispositivo ya fue identificado para este registro.');
    } else {
      visibleParts.push('Todavía no se confirma la identificación del dispositivo.');
    }

    const availableActions = success
      ? ['Continuar']
      : ['Volver', 'Registrarme'];

    const suggestedPrompts = success
      ? [
          {
            id: 'pc-registro-1',
            label: '¿Ya me registré?',
            question: '¿Ya se completó mi registro en esta pantalla?',
          },
          {
            id: 'pc-registro-2',
            label: '¿Cuál es mi código?',
            question: '¿Cuál es el código de acceso que aparece en esta pantalla?',
          },
          {
            id: 'pc-registro-3',
            label: '¿Qué hago ahora?',
            question: '¿Cuál es el siguiente paso después de este registro?',
          },
        ]
      : [
          {
            id: 'pc-registro-1',
            label: '¿Qué me falta completar?',
            question: '¿Qué campos me faltan completar en este formulario?',
          },
          {
            id: 'pc-registro-2',
            label: '¿Hay algún error visible?',
            question: '¿Hay algún error visible ahora en este formulario?',
          },
          {
            id: 'pc-registro-3',
            label: '¿A dónde vuelve esta pantalla?',
            question: '¿A dónde vuelve esta pantalla si presiono Volver?',
          },
          {
            id: 'pc-registro-4',
            label: '¿Qué hace el alias?',
            question: '¿Para qué sirve el alias en este formulario?',
          },
          {
            id: 'pc-registro-5',
            label: '¿Qué pasa al registrarme?',
            question: '¿Qué pasa cuando termino de registrarme en esta pantalla?',
          },
        ];

    const summary = success
      ? 'Pantalla de registro completado con código de acceso visible y acción para continuar.'
      : 'Pantalla de registro de participante con formulario visible, validaciones y acción para completar el registro.';

    setPageContext({
      pageId: 'proyecto-ciudadano-registro',
      pageTitle: 'Registro de participante',
      route: '/proyecto-ciudadano/registro',
      summary,
      speakableSummary: summary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Proyecto Ciudadano', 'Registro', activeViewTitle],
      visibleSections: success
        ? ['resultado-registro', 'codigo-acceso', 'continuacion']
        : ['cabecera', 'descripcion', 'formulario', 'aviso-importante'],
      visibleActions: availableActions,
      availableActions,
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: success ? codigoAcceso || undefined : undefined,
      status: loading ? 'loading' : error ? 'error' : 'ready',
      suggestedPrompts,
      dynamicData: {
        returnTo: returnTo || 'proyecto-ciudadano',
        returnDestinationLabel: destinationLabel,
        deviceReady: !!deviceId,
        success,
        loading,
        error: error || null,
        codigoAcceso: codigoAcceso || null,
        filledFields,
        missingFields,
        formValues: {
          full_name: form.full_name || null,
          dni: form.dni || null,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          district: form.district || null,
          alias: form.alias || null,
        },
      },
      contextVersion: 'pc-registro-v1',
    });
  }, [
    setPageContext,
    returnTo,
    deviceId,
    form,
    loading,
    error,
    success,
    codigoAcceso,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-white rounded-2xl border-2 border-green-600 p-8 shadow-sm">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Registro exitoso!</h1>
            <p className="text-slate-600 mb-4">
              Tu perfil ha sido creado correctamente. Guarda tu código de acceso para iniciar sesión más rápido.
            </p>

            {/* Mostrar código de acceso */}
            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-6">
              <p className="text-sm font-semibold text-amber-800 mb-1">Tu código de acceso único:</p>
              <p className="text-2xl font-mono font-bold text-amber-900 tracking-wider">{codigoAcceso}</p>
              <p className="text-xs text-amber-700 mt-2">
                Guarda este código. Lo usarás para iniciar sesión rápidamente.
              </p>
            </div>

            <Link
  href={
    normalizedReturnTo === 'espacio-emprendedor'
      ? '/espacio-emprendedor?registered=true'
      : normalizedReturnTo === 'comentarios'
      ? '/comentarios?registered=true'
      : normalizedReturnTo === '/reto-ciudadano' || normalizedReturnTo === 'reto-ciudadano'
      ? '/reto-ciudadano?registered=true'
      : normalizedReturnTo === '/reto-ciudadano/principal' || normalizedReturnTo === 'reto-ciudadano/principal'
      ? '/reto-ciudadano?registered=true'
      : normalizedReturnTo === '/reto-ciudadano/camino' || normalizedReturnTo === 'reto-ciudadano/camino'
      ? '/reto-ciudadano?registered=true'
      : '/proyecto-ciudadano?registered=true'
  }
  className="inline-block bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800"
>
  Continuar
</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Registro de participante</h1>
             <Link
  href={
    normalizedReturnTo === 'espacio-emprendedor'
      ? '/espacio-emprendedor'
      : normalizedReturnTo === 'comentarios'
      ? '/comentarios'
      : normalizedReturnTo === '/reto-ciudadano' || normalizedReturnTo === 'reto-ciudadano'
      ? '/reto-ciudadano'
      : normalizedReturnTo === '/reto-ciudadano/principal' || normalizedReturnTo === 'reto-ciudadano/principal'
      ? '/reto-ciudadano'
      : normalizedReturnTo === '/reto-ciudadano/camino' || normalizedReturnTo === 'reto-ciudadano/camino'
      ? '/reto-ciudadano'
      : '/proyecto-ciudadano'
  }
  className="text-sm text-slate-600 hover:underline"
>
  ← Volver
</Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
           <p className="text-slate-600 mb-4 text-sm">
  Completa tus datos para poder registrarte y participar. Al finalizar, recibirás un código único para iniciar sesión rápidamente.
</p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nombres completos *</label>
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">DNI *</label>
              <input
                type="text"
                name="dni"
                value={form.dni}
                onChange={handleChange}
                maxLength={8}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Correo electrónico *</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Celular *</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Alias (público) *</label>
              <input
                type="text"
                name="alias"
                value={form.alias}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Este alias será visible en los foros y listas de apoyo.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Dirección *</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Distrito *</label>
              <input
                type="text"
                name="district"
                value={form.district}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
            >
              {loading ? 'Registrando...' : 'Registrarme'}
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-4 text-center">
            <strong>⚠️ Importante:</strong> La veracidad de los datos es de exclusiva responsabilidad del participante.
            Voto Claro no verifica la identidad ni la información proporcionada. En caso de detectarse información falsa o fraudulenta,
            el participante quedará automáticamente descalificado y se reserva el derecho de informar a las autoridades competentes.
          </p>
        </div>
      </div>
    </main>
  );
}

// Componente principal con Suspense
export default function RegistroParticipantePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando...</div>}>
      <RegistroForm />
    </Suspense>
  );
}