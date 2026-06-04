'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAssistantRuntime } from '@/components/assistant/AssistantRuntimeContext';

// Función para obtener o crear device_id
function getDeviceId(): string {
  if (typeof window === 'undefined') return '';

  const KEY = 'vc_device_id';
  const existing = localStorage.getItem(KEY);

  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  return newId;
}

function sanitizeDni(value: string) {
  return value.replace(/\D/g, '').slice(0, 8);
}

function getPublicAlias(value: string | null | undefined, fallback = 'No publicado') {
  const clean = String(value || '').trim();
  return clean || fallback;
}

export default function EspacioEmprendedorPage() {
  const router = useRouter();
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [participant, setParticipant] = useState<any>(null);
  const [afiliado, setAfiliado] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dni, setDni] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [codigoAcceso, setCodigoAcceso] = useState('');
  const [loginCodigoLoading, setLoginCodigoLoading] = useState(false);
  const [loginCodigoError, setLoginCodigoError] = useState('');
  const [topProjects, setTopProjects] = useState<any[]>([]);
  const [misProyectos, setMisProyectos] = useState<any[]>([]);
  const [mensajesRecibidos, setMensajesRecibidos] = useState<any[]>([]);
  const [cargandoMensajes, setCargandoMensajes] = useState(false);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-PE', {
      timeZone: 'America/Lima',
    });
  };

  useEffect(() => {
    cargarParticipante();
  }, []);

  useEffect(() => {
    if (afiliado) {
      cargarMisProyectos();
      cargarMensajesRecibidos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afiliado]);

  const loadTopProjects = async () => {
    try {
      const { data: proyectos } = await supabase
        .from('espacio_proyectos')
        .select('id, title, category, department')
        .eq('status', 'active');

      const { data: mensajes } = await supabase
        .from('espacio_mensajes')
        .select('proyecto_id, sender_participant_id, sender_type, thread_key')
        .neq('thread_key', 'legacy-no-thread');

      const contactosPorProyecto = new Map<string, Set<string>>();

      (mensajes || []).forEach((m: any) => {
        if (m.sender_type !== 'inversionista') return;
        if (!m.sender_participant_id) return;

        if (!contactosPorProyecto.has(m.proyecto_id)) {
          contactosPorProyecto.set(m.proyecto_id, new Set<string>());
        }

        contactosPorProyecto.get(m.proyecto_id)!.add(m.sender_participant_id);
      });

      const proyectosConContactos = (proyectos || []).map((p) => ({
        ...p,
        contactos: contactosPorProyecto.get(p.id)?.size || 0,
      }));

      proyectosConContactos.sort((a, b) => b.contactos - a.contactos);
      setTopProjects(proyectosConContactos.slice(0, 3));
    } catch (err) {
      console.error('Error cargando proyectos destacados:', err);
    }
  };

  useEffect(() => {
    loadTopProjects();
  }, []);

  const cargarParticipante = async () => {
    const deviceId = getDeviceId();

    if (!deviceId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('project_participants')
        .select('id, alias, codigo_acceso, device_id')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;

      setParticipant(data || null);

      if (data) {
        const { data: afiliadoData } = await supabase
          .from('espacio_afiliados')
          .select('*')
          .eq('participant_id', data.id)
          .maybeSingle();

        setAfiliado(afiliadoData || null);
      } else {
        setAfiliado(null);
      }
    } catch (err) {
      console.error('Error cargando participante:', err);
    } finally {
      setLoading(false);
    }
  };

  const cargarMisProyectos = async () => {
    if (!afiliado) return;

    try {
      const { data } = await supabase
        .from('espacio_proyectos')
        .select('id, title, category, department, district, views, status, created_at')
        .eq('owner_id', afiliado.id)
        .order('created_at', { ascending: false });

      const { data: mensajes } = await supabase
        .from('espacio_mensajes')
        .select('proyecto_id, sender_participant_id, sender_type');

      const uniqueInvestorContacts = new Map<string, Set<string>>();

      (mensajes || []).forEach((m: any) => {
        if (m.sender_type !== 'inversionista') return;
        if (!m.sender_participant_id) return;

        if (!uniqueInvestorContacts.has(m.proyecto_id)) {
          uniqueInvestorContacts.set(m.proyecto_id, new Set<string>());
        }

        uniqueInvestorContacts.get(m.proyecto_id)!.add(m.sender_participant_id);
      });

      const proyectosConContactos = (data || []).map((p) => ({
        ...p,
        contactos: uniqueInvestorContacts.get(p.id)?.size || 0,
      }));

      setMisProyectos(proyectosConContactos);
    } catch (err) {
      console.error('Error cargando mis proyectos:', err);
    }
  };

  const cargarMensajesRecibidos = async () => {
    if (!participant || !afiliado) return;

    setCargandoMensajes(true);

    try {
      const { data: proyectosDelEmprendedor } = await supabase
        .from('espacio_proyectos')
        .select('id, title')
        .eq('owner_id', afiliado.id);

      if (!proyectosDelEmprendedor?.length) {
        setMensajesRecibidos([]);
        setCargandoMensajes(false);
        return;
      }

      const projectIds = proyectosDelEmprendedor.map((p) => p.id);

      const { data: mensajes } = await supabase
        .from('espacio_mensajes')
        .select('*')
        .in('proyecto_id', projectIds)
        .neq('thread_key', 'legacy-no-thread')
        .order('created_at', { ascending: false });

      if (!mensajes?.length) {
        setMensajesRecibidos([]);
        return;
      }

      const latestByThread = new Map<string, any>();

      for (const msg of mensajes) {
        if (!msg.thread_key) continue;
        if (!latestByThread.has(msg.thread_key)) {
          latestByThread.set(msg.thread_key, msg);
        }
      }

      const latestMsgs = Array.from(latestByThread.values());

      const investorIds = Array.from(
        new Set(
          latestMsgs
            .map((msg: any) =>
              msg.sender_type === 'inversionista'
                ? msg.sender_participant_id
                : msg.destinatario_participant_id
            )
            .filter(Boolean)
        )
      );

      const { data: participantes } = investorIds.length
        ? await supabase
            .from('project_participants')
            .select('id, alias')
            .in('id', investorIds)
        : { data: [] as any[] };

      const aliasMap = new Map<string, string>();

      (participantes || []).forEach((p: any) => {
        aliasMap.set(p.id, getPublicAlias(p.alias, 'Inversionista'));
      });

      const mensajesConNombres = latestMsgs.map((msg: any) => {
        const proyecto = proyectosDelEmprendedor.find((p) => p.id === msg.proyecto_id);
        const investorId =
          msg.sender_type === 'inversionista'
            ? msg.sender_participant_id
            : msg.destinatario_participant_id;

        return {
          id: msg.id,
          mensaje: msg.content,
          remitente: investorId ? aliasMap.get(investorId) || 'Inversionista' : 'Inversionista',
          remitente_id: investorId,
          proyecto_titulo: proyecto?.title || 'Proyecto',
          proyecto_id: msg.proyecto_id,
          created_at: msg.created_at,
          sender_type: msg.sender_type,
          thread_key: msg.thread_key,
        };
      });

      setMensajesRecibidos(mensajesConNombres);
    } catch (err) {
      console.error('Error cargando mensajes recibidos:', err);
    } finally {
      setCargandoMensajes(false);
    }
  };

  useEffect(() => {
    if (!afiliado || misProyectos.length === 0) return;

    const projectIds = misProyectos.map((p) => p.id);
    if (projectIds.length === 0) return;

    const channel = supabase
      .channel('mensajes-emprendedor')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'espacio_mensajes',
          filter: `proyecto_id=in.(${projectIds.join(',')})`,
        },
        () => {
          cargarMensajesRecibidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afiliado, misProyectos]);

  const responderMensaje = (proyectoId: string, remitenteId: string) => {
    if (!proyectoId || !remitenteId) return;
    router.push(`/espacio-emprendedor/proyectos/${proyectoId}?destinatario=${remitenteId}`);
  };

  const handleLoginConCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginCodigoLoading(true);
    setLoginCodigoError('');

    const codigo = codigoAcceso.trim().toUpperCase();

    if (!codigo) {
      setLoginCodigoError('Ingresa tu código de acceso');
      setLoginCodigoLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_participants')
        .select('id, alias, codigo_acceso')
        .eq('codigo_acceso', codigo)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setLoginCodigoError('Código de acceso no válido');
        setLoginCodigoLoading(false);
        return;
      }

      const currentDeviceId = getDeviceId();

      const { error: updateError } = await supabase
        .from('project_participants')
        .update({ device_id: currentDeviceId })
        .eq('id', data.id);

      if (updateError) throw updateError;

      await cargarParticipante();
      setCodigoAcceso('');
      setLoginCodigoError('✅ Sesión iniciada correctamente');

      setTimeout(() => setLoginCodigoError(''), 3000);
    } catch (err: any) {
      console.error('Error al iniciar sesión con código:', err);
      setLoginCodigoError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoginCodigoLoading(false);
    }
  };

  const handleVerificarDNI = async () => {
    const cleanDni = sanitizeDni(dni);

    if (!cleanDni || cleanDni.length !== 8) {
      setError('Ingresa un DNI válido de 8 dígitos.');
      return;
    }

    if (!participant) {
      setError('Primero debes registrarte como participante.');
      return;
    }

    setVerificando(true);
    setError(null);

    try {
      const { data: afiliadoExistente, error: afiliadoError } = await supabase
        .from('espacio_afiliados')
        .select('*')
        .eq('dni', cleanDni)
        .eq('is_active', true)
        .maybeSingle();

      if (afiliadoError) throw afiliadoError;

      if (!afiliadoExistente) {
        setError(
          'No se encontró afiliación habilitada para este DNI. Para publicar un proyecto, primero debes verificar tu afiliación en el canal oficial correspondiente.'
        );
        setVerificando(false);
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .from('espacio_afiliados')
        .select('*')
        .eq('participant_id', participant.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        setAfiliado(existing);
        await cargarParticipante();
        setSuccessMsg('✅ Ya estás verificado como afiliado. Bienvenido al Espacio Emprendedor.');
        setTimeout(() => setSuccessMsg(null), 3000);
        setVerificando(false);
        return;
      }

      const { data: updatedAfiliado, error: updateError } = await supabase
        .from('espacio_afiliados')
        .update({
          participant_id: participant.id,
          verified_at: new Date().toISOString(),
        })
        .eq('id', afiliadoExistente.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setAfiliado(updatedAfiliado);
      await cargarParticipante();
      setSuccessMsg('✅ DNI verificado correctamente. Bienvenido al Espacio Emprendedor.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Error verificando DNI:', err);
      setError(err.message || 'Error al verificar afiliación');
    } finally {
      setVerificando(false);
    }
  };

  useEffect(() => {
    const topTitles = topProjects
      .slice(0, 3)
      .map((p) => p?.title)
      .filter(Boolean);

    const myProjectTitles = misProyectos
      .slice(0, 5)
      .map((p) => p?.title)
      .filter(Boolean);

    const latestReceived = mensajesRecibidos.length > 0 ? mensajesRecibidos[0] : null;

    const entrepreneurViewMode = !participant
      ? 'guest-access'
      : !afiliado
      ? verificando
        ? 'dni-verification-checking'
        : 'dni-verification'
      : cargandoMensajes
      ? 'entrepreneur-dashboard-loading'
      : mensajesRecibidos.length > 0
      ? 'entrepreneur-dashboard-messages'
      : misProyectos.length > 0
      ? 'entrepreneur-dashboard-projects'
      : 'entrepreneur-dashboard-empty';

    const activeSection = !participant
      ? 'registro-o-login'
      : !afiliado
      ? 'verificacion-dni'
      : 'panel-emprendedor';

    const activeViewId =
      entrepreneurViewMode === 'guest-access'
        ? 'guest-access'
        : entrepreneurViewMode === 'dni-verification-checking'
        ? 'dni-verification-checking'
        : entrepreneurViewMode === 'dni-verification'
        ? 'dni-verification'
        : entrepreneurViewMode === 'entrepreneur-dashboard-loading'
        ? 'entrepreneur-dashboard-loading'
        : entrepreneurViewMode === 'entrepreneur-dashboard-messages'
        ? 'entrepreneur-dashboard-messages'
        : entrepreneurViewMode === 'entrepreneur-dashboard-projects'
        ? 'entrepreneur-dashboard-projects'
        : 'entrepreneur-dashboard-empty';

    const activeViewTitle =
      entrepreneurViewMode === 'guest-access'
        ? 'Acceso al Espacio Emprendedor'
        : entrepreneurViewMode === 'dni-verification-checking'
        ? 'Verificando afiliación'
        : entrepreneurViewMode === 'dni-verification'
        ? 'Verificación de afiliación'
        : entrepreneurViewMode === 'entrepreneur-dashboard-loading'
        ? 'Cargando panel del emprendedor'
        : entrepreneurViewMode === 'entrepreneur-dashboard-messages'
        ? 'Panel del emprendedor con mensajes'
        : entrepreneurViewMode === 'entrepreneur-dashboard-projects'
        ? 'Panel del emprendedor con proyectos'
        : 'Panel del emprendedor';

    const visibleSections = [
  'bienvenida',
  'proyectos-mas-contactados',
  'centro-apoyo-emprendedor',
  activeSection,
  'bloque-inversionista',
  participant && afiliado ? 'mis-proyectos' : null,
  participant && afiliado ? 'mensajes-recibidos' : null,
].filter(Boolean) as string[];

    const availableActions = !participant
  ? [
      'Registrarme ahora',
      'Iniciar sesión con código',
      'Explorar proyectos',
      'Configurar mi perfil',
      'Abrir Centro de Apoyo al Emprendedor',
      'Ver instituciones de apoyo',
      'Buscar profesionales asesores',
      'Ver guía para preparar proyecto',
    ]
  : !afiliado
  ? [
      'Verificar DNI',
      'Explorar proyectos',
      'Configurar mi perfil',
      'Abrir Centro de Apoyo al Emprendedor',
      'Ver instituciones de apoyo',
      'Buscar profesionales asesores',
      'Ver guía para preparar proyecto',
    ]
  : [
      'Publicar nuevo proyecto',
      'Ver detalles de proyecto',
      'Responder mensajes',
      'Explorar proyectos',
      'Configurar mi perfil',
      'Abrir Centro de Apoyo al Emprendedor',
      'Ver instituciones de apoyo',
      'Buscar profesionales asesores',
      'Ver guía para preparar proyecto',
    ];
     const summary =
  entrepreneurViewMode === 'guest-access'
    ? 'Acceso al Espacio Emprendedor con registro, inicio de sesión por código, exploración de proyectos y Centro de Apoyo al Emprendedor.'
    : entrepreneurViewMode === 'dni-verification-checking'
    ? 'Verificación de afiliación en curso, con acceso visible al Centro de Apoyo al Emprendedor.'
    : entrepreneurViewMode === 'dni-verification'
    ? 'Verificación de afiliación pendiente para habilitar la publicación de proyectos, con acceso a instituciones, profesionales y guía de preparación.'
    : entrepreneurViewMode === 'entrepreneur-dashboard-loading'
    ? 'Panel emprendedor cargando proyectos y mensajes, con Centro de Apoyo al Emprendedor disponible.'
    : entrepreneurViewMode === 'entrepreneur-dashboard-messages'
    ? 'Panel emprendedor con proyectos propios, mensajes recibidos y acceso a apoyo externo y profesional.'
    : entrepreneurViewMode === 'entrepreneur-dashboard-projects'
    ? 'Panel emprendedor con proyectos propios visibles y acceso al Centro de Apoyo al Emprendedor.'
    : 'Panel emprendedor listo para publicar el primer proyecto, con apoyo para preparar, mejorar y orientar el proyecto.';

     const speakableSummary =
  entrepreneurViewMode === 'guest-access'
    ? 'Estamos en Espacio Emprendedor. Desde aquí puedes registrarte, ingresar con tu código, explorar proyectos y acceder al Centro de Apoyo al Emprendedor para encontrar instituciones, profesionales y guías.'
    : entrepreneurViewMode === 'dni-verification-checking'
    ? 'Estamos en Espacio Emprendedor y ahora se está verificando la afiliación para habilitar la publicación de proyectos. También puedes revisar el Centro de Apoyo al Emprendedor.'
    : entrepreneurViewMode === 'dni-verification'
    ? 'Estamos en Espacio Emprendedor. Ya entraste como participante, pero todavía falta verificar afiliación para publicar proyectos. Mientras tanto, puedes revisar instituciones, profesionales asesores y guías para preparar mejor tu proyecto.'
    : entrepreneurViewMode === 'entrepreneur-dashboard-loading'
    ? 'Estamos en tu panel del Espacio Emprendedor. La pantalla está cargando tus proyectos y mensajes. También tienes acceso al Centro de Apoyo al Emprendedor.'
    : entrepreneurViewMode === 'entrepreneur-dashboard-messages'
    ? 'Estamos en tu panel del Espacio Emprendedor. Aquí puedes revisar tus proyectos, tus mensajes recibidos y acceder a apoyo profesional o institucional, sin exponer datos privados al asistente.'
    : entrepreneurViewMode === 'entrepreneur-dashboard-projects'
    ? 'Estamos en tu panel del Espacio Emprendedor. Aquí puedes revisar tus proyectos publicados, publicar uno nuevo y acceder al Centro de Apoyo al Emprendedor.'
    : 'Estamos en tu panel del Espacio Emprendedor. Ya tienes acceso como emprendedor y desde aquí puedes publicar tu primer proyecto o buscar apoyo para prepararlo mejor.';
    const visibleParts: string[] = [];

    visibleParts.push(`Vista activa: ${activeViewTitle}.`);
    visibleParts.push('Pantalla visible: Espacio Emprendedor APP.');
    visibleParts.push('Mensaje principal visible: conecta tu proyecto emprendedor con posibles interesados o inversionistas.');
    visibleParts.push('Voto Claro no garantiza inversión, financiamiento, rentabilidad, contacto efectivo ni cierre de acuerdos.');
    visibleParts.push('Bloque visible para inversionistas: explorar proyectos y configurar perfil.');
    visibleParts.push('Bloque visible: Centro de Apoyo al Emprendedor.');
visibleParts.push('El Centro de Apoyo permite acceder a instituciones, programas, profesionales asesores y guías para preparar mejor un proyecto.');
visibleParts.push('Voto Claro muestra información orientativa y espacios de contacto, pero no garantiza financiamiento, contratación de servicios profesionales ni resultados económicos.');

    if (loading) {
      visibleParts.push('La pantalla está cargando datos del Espacio Emprendedor.');
    }

    if (!participant && !loading) {
      visibleParts.push('Se muestra registro para participar e inicio de sesión con código.');
    }

    if (participant && !afiliado) {
      visibleParts.push('El usuario ya es participante, pero todavía no está verificado como afiliado.');
      visibleParts.push('Se muestra el formulario para verificar DNI, sin exponer el DNI al asistente.');
    }

    if (participant && afiliado) {
      visibleParts.push('El usuario ya está verificado como emprendedor.');
      visibleParts.push('Se muestran sus proyectos y mensajes recibidos.');
    }

    if (topTitles.length) {
      visibleParts.push(`Proyectos más contactados visibles: ${topTitles.join(', ')}.`);
    } else {
      visibleParts.push('No hay proyectos más contactados visibles en este momento.');
    }

    if (myProjectTitles.length) {
      visibleParts.push(`Cantidad de proyectos propios visibles: ${myProjectTitles.length}.`);
      visibleParts.push('Los títulos completos de proyectos propios no se exponen al asistente.');
    }

    if (latestReceived) {
      visibleParts.push('Hay un último mensaje recibido visible, sin exponer su contenido completo al asistente.');
      visibleParts.push('El remitente se muestra como alias público o Inversionista.');
      visibleParts.push(`Fecha y hora visibles del último mensaje: ${formatDate(latestReceived.created_at)}.`);
    }

    if (cargandoMensajes) {
      visibleParts.push('La bandeja de mensajes está cargando.');
    }

    if (error) {
      visibleParts.push(`Error visible: ${error}`);
    }

    if (successMsg) {
      visibleParts.push(`Mensaje de éxito visible: ${successMsg}`);
    }

    if (loginCodigoError) {
      visibleParts.push(`Mensaje visible de acceso: ${loginCodigoError}`);
    }

    const status = loading ? 'loading' : error ? 'error' : 'ready';

    setPageContext({
      pageId: 'espacio-emprendedor',
      pageTitle: 'Espacio Emprendedor',
      route: '/espacio-emprendedor',
      summary,
      speakableSummary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ['Espacio Emprendedor', activeViewTitle],
      visibleSections,
      suggestedPrompts: !participant
        ? [
            {
              id: 'ee-main-1',
              label: '¿Qué puedo hacer aquí?',
              question: '¿Qué puedo hacer aquí en esta pantalla?',
            },
            {
              id: 'ee-main-2',
              label: '¿Cómo publico un proyecto?',
              question: '¿Qué debo hacer en esta pantalla para poder publicar un proyecto?',
            },
            {
              id: 'ee-main-3',
              label: '¿Puedo explorar proyectos?',
              question: '¿Puedo explorar proyectos desde esta pantalla?',
            },
            {
              id: 'ee-main-4',
              label: '¿Qué me falta?',
              question: 'Según esta pantalla, ¿qué me falta para publicar un proyecto?',
            },
          ]
        : !afiliado
        ? [
            {
              id: 'ee-main-5',
              label: '¿Qué me falta para publicar?',
              question: 'Según esta pantalla, ¿qué me falta para poder publicar un proyecto?',
            },
            {
              id: 'ee-main-6',
              label: '¿Debo verificar DNI?',
              question: '¿Debo verificar mi afiliación en esta pantalla para continuar?',
            },
            {
              id: 'ee-main-7',
              label: '¿Puedo explorar proyectos?',
              question: '¿Puedo explorar proyectos desde esta pantalla?',
            },
            {
              id: 'ee-main-8',
              label: '¿Puedo configurar mi perfil?',
              question: '¿Puedo configurar mi perfil de inversionista desde esta pantalla?',
            },
          ]
        : [
            {
              id: 'ee-main-9',
              label: '¿Qué puedo hacer aquí?',
              question: '¿Qué puedo hacer aquí en esta pantalla del panel emprendedor?',
            },
            {
              id: 'ee-main-10',
              label: '¿Cuántos proyectos tengo?',
              question: '¿Cuántos proyectos propios tengo visibles en esta pantalla?',
            },
            {
              id: 'ee-main-11',
              label: '¿Cuántos mensajes tengo?',
              question: '¿Cuántos mensajes recibidos tengo visibles en esta pantalla?',
            },
            {
              id: 'ee-main-12',
              label: '¿Cómo publico uno nuevo?',
              question: '¿Cómo paso desde esta pantalla a publicar un nuevo proyecto?',
            },
          ],
      visibleText: visibleParts.join('\n'),
      availableActions,
      selectedItemId:
        latestReceived?.proyecto_id ||
        topProjects[0]?.id ||
        misProyectos[0]?.id ||
        undefined,
      selectedItemTitle:
        topTitles[0] || undefined,
      status,
      dynamicData: {
        participantLogueado: !!participant,
        participantDataProtected: true,
        afiliadoVerificado: !!afiliado,
        dniProtected: !!dni,
        codigoAccesoProtected: !!codigoAcceso,
        accessMode: activeViewId,
        investorBlockVisible: true,
        entrepreneurBlockVisible: !!participant,
        verificationBlockVisible: !!participant && !afiliado,
        dashboardVisible: !!participant && !!afiliado,
        proyectosDestacadosCount: topProjects.length,
        proyectosDestacadosTitles: topTitles,
        misProyectosCount: misProyectos.length,
        misProyectosTitlesProtected: misProyectos.length > 0,
        mensajesRecibidosCount: mensajesRecibidos.length,
        mensajesContenidoProtegido: true,
        cargandoMensajes,
        loginCodigoLoading,
        verificandoDni: verificando,
        lastMessageProjectTitleProtected: !!latestReceived?.proyecto_titulo,
        lastMessageSenderProtected: !!latestReceived?.remitente,
        lastMessageAtIso: latestReceived?.created_at || '',
        lastMessageAtLabel: latestReceived?.created_at
          ? formatDate(latestReceived.created_at)
          : '',
        latestInvestorThreadKeyProtected: !!latestReceived?.thread_key,
        canExploreProjects: true,
canOpenInvestorProfile: true,
canPublishProject: !!participant && !!afiliado,
canVerifyDni: !!participant && !afiliado,
supportCenterVisible: true,
canOpenSupportCenter: true,
canOpenInstitutionsSupport: true,
canOpenProfessionalAdvisors: true,
canOpenProjectGuide: true,
supportCenterDisclaimer:
  'Voto Claro muestra información orientativa y espacios de contacto, pero no garantiza financiamiento, contratación profesional ni resultados económicos.',
investmentDisclaimer:
  'Voto Claro no garantiza inversión, financiamiento, rentabilidad, contacto efectivo ni cierre de acuerdos.',
      },
    });
  }, [
    setPageContext,
    loading,
    participant,
    afiliado,
    topProjects,
    misProyectos,
    mensajesRecibidos,
    cargandoMensajes,
    loginCodigoLoading,
    verificando,
    error,
    successMsg,
    loginCodigoError,
    dni,
    codigoAcceso,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  const card = 'rounded-2xl border-2 border-red-600 p-6 shadow-sm vc-fade-up vc-card-hover';
  const btnPrimary = 'bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition vc-btn-wave vc-btn-pulse';
  const btnSecondary = 'bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition vc-btn-wave vc-btn-pulse';
  const btnOutline = 'bg-slate-200 text-slate-800 px-4 py-2 rounded-xl font-semibold hover:bg-slate-300 transition text-center vc-btn-wave vc-btn-pulse';
  const inputStyle = 'w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none';

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6 vc-fade-up">
          <h1 className="text-3xl font-bold text-slate-900">Espacio Emprendedor APP</h1>
          <button
            type="button"
            onClick={() => router.push('/')}
            className={btnPrimary}
          >
            ← Volver al inicio
          </button>
        </div>

        {successMsg && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl text-sm vc-slide-in">
            {successMsg}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm vc-slide-in">
            {error}
          </div>
        )}

        <div className={`bg-white ${card}`}>
          <p className="text-slate-700 text-lg font-semibold">
            💼 Conecta tu proyecto emprendedor con posibles interesados o inversionistas.
          </p>

          <div className="mt-3 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-300">
            <strong>⚠️ Importante:</strong> Los proyectos presentados son de exclusiva responsabilidad de sus autores.
            Voto Claro no garantiza inversión, financiamiento, rentabilidad, contacto efectivo, cierre de acuerdos ni aval financiero.
            Todo contacto entre usuarios debe ser evaluado de forma independiente y bajo responsabilidad de las partes.
          </div>
        </div>

        <div className={`bg-white ${card} mt-6`}>
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="text-2xl">📞</span> Proyectos más contactados
          </h2>

          <p className="text-xs text-slate-500 mb-3">
            Los contactos muestran interés interno dentro de la plataforma. No equivalen a inversión confirmada ni compromiso financiero.
          </p>

          <div className="space-y-3">
            {topProjects.length === 0 ? (
              <p className="text-slate-500 text-sm">Aún no hay proyectos contactados.</p>
            ) : (
              topProjects.map((project, index) => (
                <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl vc-card-hover">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-green-600 w-8">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </span>

                    <div>
                      <p className="font-semibold text-slate-800">{project.title}</p>
                      <p className="text-xs text-slate-500">
                        {project.category} • {project.department}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-green-600">{project.contactos || 0} contactos</p>
                    <button
                      type="button"
                      onClick={() => router.push(`/espacio-emprendedor/proyectos/${project.id}`)}
                      className="text-xs text-green-700 hover:underline"
                    >
                      Ver proyecto →
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
                 <div className="bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-sm mt-6 vc-fade-up vc-delay-1">
          <div className="flex items-start gap-3">
            <div className="text-3xl leading-none">🤝</div>

            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                Centro de Apoyo al Emprendedor
              </h2>

              <p className="text-slate-700 text-sm mb-3">
                Encuentra instituciones, programas, profesionales asesores y guías que pueden ayudarte a preparar,
                mejorar o revisar tu proyecto antes de contactar posibles inversionistas o aliados.
              </p>

              <div className="text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-300 mb-4">
                <strong>⚠️ Aviso:</strong> Voto Claro muestra información orientativa y espacios de contacto.
                No garantiza financiamiento, aprobación de proyectos, contratación de servicios profesionales ni resultados económicos.
                Cada usuario debe verificar requisitos, credenciales, costos y condiciones directamente con cada institución o profesional.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/espacio-emprendedor/apoyo/instituciones')}
                  className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100 transition vc-btn-wave vc-btn-pulse"
                >
                  <div className="text-sm font-extrabold text-slate-900">
                    🏛️ Instituciones
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Programas, fondos, incubadoras y oportunidades externas.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/espacio-emprendedor/apoyo/profesionales')}
                  className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100 transition vc-btn-wave vc-btn-pulse"
                >
                  <div className="text-sm font-extrabold text-slate-900">
                    👩‍💼 Profesionales
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Asesoría legal, contable, financiera y de proyectos.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/espacio-emprendedor/apoyo/guia')}
                  className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition vc-btn-wave vc-btn-pulse"
                >
                  <div className="text-sm font-extrabold text-slate-900">
                    📘 Guía práctica
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Aprende a ordenar tu idea y preparar mejor tu proyecto.
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => router.push('/espacio-emprendedor/apoyo')}
                className="mt-4 inline-flex items-center rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 transition vc-btn-wave vc-btn-pulse"
              >
                Abrir Centro de Apoyo →
              </button>
            </div>
          </div>
        </div>
        {!participant ? (
          <>
            <div className={`bg-white ${card} mt-6`}>
              <h2 className="text-xl font-bold text-slate-900 mb-3">Regístrate para participar</h2>
              <p className="text-slate-600 mb-4">
                Para acceder al Espacio Emprendedor, primero debes registrarte como participante.
              </p>

              <button
                type="button"
                onClick={() => router.push('/proyecto-ciudadano/registro?returnTo=espacio-emprendedor')}
                className={btnPrimary}
              >
                Registrarme ahora
              </button>
            </div>

            <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm mt-6 vc-fade-up vc-delay-1">
              <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="text-2xl">🔑</span> Iniciar sesión con código
              </h2>

              <p className="text-slate-600 mb-4 text-sm">
                Si ya tienes un código de acceso, ingrésalo aquí.
              </p>

              {loginCodigoError && (
                <div
                  className="mb-4 p-3 rounded-xl text-sm"
                  style={{
                    backgroundColor: loginCodigoError.includes('✅') ? '#f0fdf4' : '#fee2e2',
                    border: loginCodigoError.includes('✅') ? '1px solid #bbf7d0' : '1px solid #fecaca',
                    color: loginCodigoError.includes('✅') ? '#166534' : '#dc2626',
                  }}
                >
                  {loginCodigoError}
                </div>
              )}

              <form onSubmit={handleLoginConCodigo} className="space-y-3">
                <input
                  type="text"
                  placeholder="Ej: EMP-2026-3A7F9K"
                  value={codigoAcceso}
                  onChange={(e) => setCodigoAcceso(e.target.value.toUpperCase())}
                  className={inputStyle}
                  disabled={loginCodigoLoading}
                />

                <button
                  type="submit"
                  disabled={loginCodigoLoading}
                  className="w-full bg-blue-700 text-white py-2 rounded-xl font-semibold hover:bg-blue-800 transition disabled:opacity-50 vc-btn-wave vc-btn-pulse"
                >
                  {loginCodigoLoading ? 'Verificando...' : 'Iniciar sesión con código'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-white rounded-2xl border-2 border-green-600 p-6 shadow-sm vc-fade-up">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">💼</span>
                <h2 className="text-xl font-bold text-slate-900">Como Emprendedor</h2>
              </div>

              {!afiliado ? (
                <div>
                  <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded-lg mb-3">
                    Para publicar proyectos, debes verificar tu afiliación habilitada para este espacio.
                  </p>

                  <div className="space-y-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="DNI (8 dígitos)"
                      value={dni}
                      onChange={(e) => setDni(sanitizeDni(e.target.value))}
                      className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                      maxLength={8}
                    />

                    <button
                      type="button"
                      onClick={handleVerificarDNI}
                      disabled={verificando}
                      className="w-full rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 vc-btn-wave vc-btn-pulse px-4 py-3"
                    >
                      {verificando ? 'Verificando DNI...' : 'Verificar DNI'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mt-2">
                    La verificación depende de la información registrada previamente en la base habilitada para este espacio.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-green-700 bg-green-50 p-2 rounded-lg mb-3">
                      ✅ Afiliación verificada. Bienvenido al Espacio Emprendedor.
                    </p>

                    <button
                      type="button"
                      onClick={() => router.push('/espacio-emprendedor/nuevo-proyecto')}
                      className="inline-block bg-green-700 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-800 vc-btn-wave vc-btn-pulse"
                    >
                      + Publicar nuevo proyecto
                    </button>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span>📋</span> Mis proyectos
                    </h3>

                    {misProyectos.length === 0 ? (
                      <p className="text-slate-500 text-sm">Aún no has publicado proyectos.</p>
                    ) : (
                      <div className="space-y-3">
                        {misProyectos.map((proyecto) => (
                          <div key={proyecto.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 vc-card-hover">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold text-slate-800">{proyecto.title}</h4>
                                <p className="text-xs text-slate-500">
                                  {proyecto.category} • {proyecto.department} - {proyecto.district}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  👁️ {proyecto.views || 0} vistas • 📩 {proyecto.contactos || 0} contactos
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => router.push(`/espacio-emprendedor/proyectos/${proyecto.id}`)}
                                className="text-sm text-green-700 hover:underline"
                              >
                                Ver detalles →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span>💬</span> Mensajes recibidos
                    </h3>

                    {cargandoMensajes ? (
                      <p className="text-slate-500 text-sm">Cargando mensajes...</p>
                    ) : mensajesRecibidos.length === 0 ? (
                      <p className="text-slate-500 text-sm">No tienes mensajes nuevos.</p>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {mensajesRecibidos.map((msg) => (
                          <div key={msg.id} className="bg-slate-50 rounded-xl p-3 border-l-4 border-green-500 vc-card-hover">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-slate-800">{msg.remitente}</p>
                                  <span className="text-xs text-slate-400">
                                    {formatDate(msg.created_at)}
                                  </span>
                                </div>

                                <p className="text-xs text-slate-500 mt-0.5">
                                  Proyecto: {msg.proyecto_titulo}
                                </p>

                                <p className="text-sm text-slate-700 mt-2">{msg.mensaje}</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => responderMensaje(msg.proyecto_id, msg.remitente_id)}
                              className="mt-2 text-xs text-green-700 hover:underline vc-btn-wave"
                            >
                              Responder →
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 mt-2">
                      Los mensajes son comunicaciones internas entre usuarios. No representan compromiso de inversión ni acuerdo económico.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 shadow-sm vc-fade-up vc-delay-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">💰</span>
                <h2 className="text-xl font-bold text-slate-900">Como Inversionista</h2>
              </div>

              <p className="text-slate-600 mb-3">
                Explora proyectos, contacta emprendedores y configura tus preferencias para recibir notificaciones.
              </p>

              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-2 mb-4">
                El uso de esta sección no constituye asesoría financiera, oferta pública de inversión ni garantía de rentabilidad.
                Todo contacto o acuerdo posterior es responsabilidad de las partes.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/espacio-emprendedor/explorar')}
                  className={`${btnSecondary} text-center`}
                >
                  🔍 Explorar proyectos
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/espacio-emprendedor/perfil-inversionista')}
                  className={btnOutline}
                >
                  ⚙️ Configurar mi perfil
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}