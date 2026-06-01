'use client';

import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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

// Funciones para proteger datos sensibles frente al asistente
function maskAccessCode(code: string | null) {
  const clean = String(code || '').trim();
  if (!clean) return '';
  return `••••-${clean.slice(-4)}`;
}

function maskDni(dni: string) {
  const clean = String(dni || '').replace(/\D/g, '');
  if (!clean) return '';
  return `••••${clean.slice(-4)}`;
}

function maskEmail(email: string) {
  const clean = String(email || '').trim();
  if (!clean || !clean.includes('@')) return '';
  const [name, domain] = clean.split('@');
  const visible = name.slice(0, 2);
  return `${visible}•••@${domain}`;
}

function maskPhone(phone: string) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return `••••••${clean.slice(-3)}`;
}

// Componente interno que usa useSearchParams
function RegistroForm() {
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
  const [dataConsentAccepted, setDataConsentAccepted] = useState(false);

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'dni') {
      setForm({ ...form, dni: value.replace(/\D/g, '').slice(0, 8) });
      return;
    }

    if (name === 'phone') {
      setForm({ ...form, phone: value.replace(/[^\d+]/g, '').slice(0, 15) });
      return;
    }

    setForm({ ...form, [name]: value });
  };

  const getReturnHref = (registered = false) => {
    const suffix = registered ? '?registered=true' : '';

    if (normalizedReturnTo === 'espacio-emprendedor') {
      return `/espacio-emprendedor${suffix}`;
    }

    if (normalizedReturnTo === 'comentarios') {
      return `/comentarios${suffix}`;
    }

    if (
      normalizedReturnTo === '/reto-ciudadano' ||
      normalizedReturnTo === 'reto-ciudadano' ||
      normalizedReturnTo === '/reto-ciudadano/principal' ||
      normalizedReturnTo === 'reto-ciudadano/principal' ||
      normalizedReturnTo === '/reto-ciudadano/camino' ||
      normalizedReturnTo === 'reto-ciudadano/camino'
    ) {
      return `/reto-ciudadano${suffix}`;
    }

    return `/proyecto-ciudadano${suffix}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (
      !form.full_name.trim() ||
      !form.dni.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !form.alias.trim() ||
      !form.address.trim() ||
      !form.district.trim()
    ) {
      setError('Todos los campos son obligatorios.');
      setLoading(false);
      return;
    }

    if (form.dni.trim().length !== 8) {
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

    if (!dataConsentAccepted) {
      setError('Debes aceptar las reglas de participación y el tratamiento de datos personales para registrarte.');
      setLoading(false);
      return;
    }

    try {
      // Generar código de acceso
      const codigo = await generarCodigoAcceso();

      const { error } = await supabase
        .from('project_participants')
        .insert({
          full_name: form.full_name.trim(),
          dni: form.dni.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          district: form.district.trim(),
          alias: form.alias.trim(),
          device_id: deviceId,
          codigo_acceso: codigo,
        })
        .select()
        .single();

      if (error) throw error;

      setCodigoAcceso(codigo);
      setSuccess(true);
      setLoading(false);
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

    if (
      normalizedReturnTo === '/reto-ciudadano' ||
      normalizedReturnTo === 'reto-ciudadano' ||
      normalizedReturnTo === '/reto-ciudadano/principal' ||
      normalizedReturnTo === 'reto-ciudadano/principal' ||
      normalizedReturnTo === '/reto-ciudadano/camino' ||
      normalizedReturnTo === 'reto-ciudadano/camino'
    ) {
      visibleParts.push('Esta pantalla de registro fue abierta desde Reto Ciudadano.');
      visibleParts.push('Este registro general permite participar en modalidades habilitadas dentro de Reto Ciudadano, según reglas y validación aplicables.');
      visibleParts.push('Al completar el formulario, el participante recibirá un código de acceso personal para iniciar sesión rápidamente.');
    }

    if (success) {
      visibleParts.push('El registro ya fue completado exitosamente.');
      if (codigoAcceso) {
        visibleParts.push(`Se muestra un código de acceso al participante, protegido para el asistente como ${maskAccessCode(codigoAcceso)}.`);
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
        visibleParts.push(`Hay un DNI escrito, protegido como ${maskDni(form.dni)}.`);
      }

      if (form.email) {
        visibleParts.push(`Hay un correo escrito, protegido como ${maskEmail(form.email)}.`);
      }

      if (form.phone) {
        visibleParts.push(`Hay un celular escrito, protegido como ${maskPhone(form.phone)}.`);
      }

      if (form.alias) {
        visibleParts.push('Hay un alias escrito en el formulario.');
      }

      visibleParts.push(
        dataConsentAccepted
          ? 'La aceptación de reglas y tratamiento de datos está marcada.'
          : 'La aceptación de reglas y tratamiento de datos todavía no está marcada.'
      );

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
      : ['Volver', 'Aceptar reglas y tratamiento de datos', 'Registrarme'];

    const suggestedPrompts = success
      ? [
          {
            id: 'pc-registro-1',
            label: '¿Ya me registré?',
            question: '¿Ya se completó mi registro en esta pantalla?',
          },
          {
            id: 'pc-registro-2',
            label: '¿Cómo guardo mi código?',
            question: '¿Qué debo hacer con el código de acceso que aparece en esta pantalla?',
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
      ? 'Pantalla de registro completado con código de acceso visible para el usuario, sin exponerlo completo al asistente.'
      : (
          normalizedReturnTo === '/reto-ciudadano' ||
          normalizedReturnTo === 'reto-ciudadano' ||
          normalizedReturnTo === '/reto-ciudadano/principal' ||
          normalizedReturnTo === 'reto-ciudadano/principal' ||
          normalizedReturnTo === '/reto-ciudadano/camino' ||
          normalizedReturnTo === 'reto-ciudadano/camino'
        )
      ? 'Pantalla de registro general abierta desde Reto Ciudadano para habilitar acceso con código y participación en modalidades habilitadas, sujetas a reglas, validación y tratamiento de datos.'
      : 'Pantalla de registro de participante con formulario visible, validaciones, aviso de datos personales y acción para completar el registro.';

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
        : ['cabecera', 'descripcion', 'aviso-datos-personales', 'formulario', 'aceptacion-datos', 'aviso-importante'],
      visibleActions: availableActions,
      availableActions,
      visibleText: visibleParts.join('\n'),
      selectedItemTitle: success ? 'Registro completado' : undefined,
      status: loading ? 'loading' : error ? 'error' : 'ready',
      suggestedPrompts,
      dynamicData: {
        returnTo: returnTo || 'proyecto-ciudadano',
        returnDestinationLabel: destinationLabel,
        deviceReady: !!deviceId,
        success,
        loading,
        error: error || null,
        codigoAccesoVisible: !!codigoAcceso,
        codigoAccesoMasked: codigoAcceso ? maskAccessCode(codigoAcceso) : null,
        filledFields,
        missingFields,
        dataConsentAccepted,
        formValuesProtected: {
          full_nameFilled: !!form.full_name,
          dniFilled: !!form.dni,
          dniMasked: form.dni ? maskDni(form.dni) : null,
          emailFilled: !!form.email,
          emailMasked: form.email ? maskEmail(form.email) : null,
          phoneFilled: !!form.phone,
          phoneMasked: form.phone ? maskPhone(form.phone) : null,
          addressFilled: !!form.address,
          districtFilled: !!form.district,
          aliasFilled: !!form.alias,
        },
      },
      contextVersion: 'pc-registro-v2',
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
    dataConsentAccepted,
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

            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              ¡Registro exitoso!
            </h1>

            <p className="text-slate-600 mb-4">
              Tu perfil ha sido creado correctamente. Guarda tu código de acceso en un lugar seguro. No lo compartas públicamente.
            </p>

            {/* Mostrar código de acceso */}
            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-6">
              <p className="text-sm font-semibold text-amber-800 mb-1">
                Tu código de acceso personal:
              </p>

              <p className="text-2xl font-mono font-bold text-amber-900 tracking-wider">
                {codigoAcceso}
              </p>

              <p className="text-xs text-amber-700 mt-2">
                Guarda este código. Lo usarás para iniciar sesión rápidamente. No lo publiques ni lo compartas con terceros.
              </p>
            </div>

            <Link
              href={getReturnHref(true)}
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
          <h1 className="text-2xl font-bold text-slate-900">
            Registro de participante
          </h1>

          <Link
            href={getReturnHref(false)}
            className="text-sm text-slate-600 hover:underline"
          >
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <p className="text-slate-600 mb-4 text-sm">
            Completa tus datos para poder registrarte y participar en las dinámicas habilitadas.
            Al finalizar, recibirás un código personal para iniciar sesión rápidamente.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="mb-4 p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs leading-relaxed">
            <strong>🔐 Aviso de datos personales:</strong> Los datos solicitados se usan para identificar al participante,
            gestionar su participación, evitar duplicidades, validar apoyos o proyectos y permitir el contacto administrativo
            relacionado con las dinámicas de VOTO CLARO. El alias será el dato visible públicamente cuando corresponda.
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Nombres completos *
              </label>
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                DNI *
              </label>
              <input
                type="text"
                name="dni"
                value={form.dni}
                onChange={handleChange}
                maxLength={8}
                inputMode="numeric"
                pattern="[0-9]{8}"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Correo electrónico *
              </label>
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Celular *
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                inputMode="tel"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Alias público *
              </label>
              <input
                type="text"
                name="alias"
                value={form.alias}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Este alias podrá mostrarse públicamente en foros, apoyos o listados. No uses tu DNI, teléfono, correo ni datos sensibles como alias.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Dirección *
              </label>
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Distrito *
              </label>
              <input
                type="text"
                name="district"
                value={form.district}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-300 rounded-xl p-3">
              <input
                type="checkbox"
                checked={dataConsentAccepted}
                onChange={(e) => setDataConsentAccepted(e.target.checked)}
                className="mt-1"
              />
              <span>
                Declaro que la información registrada es veraz, que acepto las reglas de participación
                y que autorizo el tratamiento de mis datos personales para gestionar mi participación en VOTO CLARO.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !dataConsentAccepted}
              className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
            >
              {loading ? 'Registrando...' : 'Registrarme'}
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-4 text-center leading-relaxed">
            <strong>⚠️ Importante:</strong> La veracidad de los datos es responsabilidad del participante.
            VOTO CLARO podrá revisar, validar o excluir registros que presenten inconsistencias, duplicidades o indicios de uso indebido,
            conforme a sus reglas de participación y políticas de tratamiento de datos.
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