import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown, max = 1200) {
  return String(value || '').trim().slice(0, max);
}

function getSafeName(value: unknown, fallback = 'Profesional') {
  const clean = String(value || '').trim();
  return clean || fallback;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            'Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.',
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const deviceId = String(searchParams.get('device_id') || '').trim();

    if (!deviceId) {
      return NextResponse.json(
        { error: 'No se recibió device_id para identificar al participante.' },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: participant, error: participantError } = await admin
      .from('project_participants')
      .select('id, alias, full_name')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (participantError) throw participantError;

    if (!participant) {
      return NextResponse.json(
        { error: 'Debes iniciar sesión para ver tus conversaciones.' },
        { status: 401 }
      );
    }

    const { data: messages, error: messagesError } = await admin
      .from('espacio_profesional_mensajes')
      .select(`
        id,
        professional_id,
        sender_participant_id,
        receiver_participant_id,
        thread_key,
        content,
        is_read,
        status,
        created_at
      `)
      .eq('status', 'active')
      .or(
        `sender_participant_id.eq.${participant.id},receiver_participant_id.eq.${participant.id}`
      )
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    const professionalIds = Array.from(
      new Set((messages || []).map((m: any) => m.professional_id).filter(Boolean))
    );

    const { data: professionals } = professionalIds.length
      ? await admin
          .from('espacio_profesionales')
          .select('id, public_name, professional_type, codigo_profesional, participant_id')
          .in('id', professionalIds)
      : { data: [] as any[] };

    const professionalMap = new Map<string, any>();

    (professionals || []).forEach((item: any) => {
      professionalMap.set(item.id, item);
    });

    const participantIds = Array.from(
      new Set(
        (messages || [])
          .flatMap((m: any) => [m.sender_participant_id, m.receiver_participant_id])
          .filter(Boolean)
      )
    );

    const { data: participants } = participantIds.length
      ? await admin
          .from('project_participants')
          .select('id, alias, full_name')
          .in('id', participantIds)
      : { data: [] as any[] };

    const participantMap = new Map<string, any>();

    (participants || []).forEach((item: any) => {
      participantMap.set(item.id, item);
    });

    const conversationMap = new Map<string, any>();

    for (const msg of messages || []) {
      const professional = professionalMap.get(msg.professional_id);
      const threadKey =
        msg.thread_key ||
        `${msg.professional_id}:${msg.sender_participant_id}:${msg.receiver_participant_id}`;

      if (!conversationMap.has(threadKey)) {
        conversationMap.set(threadKey, {
          thread_key: threadKey,
          professional_id: msg.professional_id,
          professional_name: getSafeName(professional?.public_name),
          professional_type: professional?.professional_type || '',
          codigo_profesional: professional?.codigo_profesional || '',
          last_message_at: msg.created_at,
          messages: [],
        });
      }

      const conversation = conversationMap.get(threadKey);
      const sender = participantMap.get(msg.sender_participant_id);

      conversation.messages.push({
        id: msg.id,
        content: msg.content,
        is_read: msg.is_read,
        created_at: msg.created_at,
        sender_alias:
          sender?.alias ||
          sender?.full_name?.split(' ')[0] ||
          'Participante',
        is_from_me: String(msg.sender_participant_id) === String(participant.id),
      });

      conversation.last_message_at = msg.created_at;
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
    );

    return NextResponse.json({
      ok: true,
      participant: {
        id: participant.id,
        alias: participant.alias || null,
      },
      conversations,
    });
  } catch (err: any) {
    console.error('Error cargando conversaciones del usuario:', err);

    return NextResponse.json(
      {
        error: 'No se pudieron cargar tus conversaciones con profesionales.',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const device_id = cleanText(body.device_id, 120);
    const thread_key = cleanText(body.thread_key, 300);
    const professional_id = cleanText(body.professional_id, 120);
    const content = cleanText(body.content, 1200);

    if (!device_id) {
      return NextResponse.json(
        { error: 'Debes iniciar sesión para responder.' },
        { status: 400 }
      );
    }

    if (!thread_key || !professional_id) {
      return NextResponse.json(
        { error: 'No se pudo identificar la conversación.' },
        { status: 400 }
      );
    }

    if (!content || content.length < 10) {
      return NextResponse.json(
        { error: 'La respuesta debe tener al menos 10 caracteres.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            'Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.',
        },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: participant, error: participantError } = await admin
      .from('project_participants')
      .select('id')
      .eq('device_id', device_id)
      .maybeSingle();

    if (participantError) throw participantError;

    if (!participant) {
      return NextResponse.json(
        { error: 'Debes iniciar sesión para responder.' },
        { status: 401 }
      );
    }

    const { data: professional, error: professionalError } = await admin
      .from('espacio_profesionales')
      .select('id, participant_id, is_active, status')
      .eq('id', professional_id)
      .eq('is_active', true)
      .eq('status', 'active')
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json(
        { error: 'No se encontró el profesional asociado a esta conversación.' },
        { status: 404 }
      );
    }

    const { data: conversationCheck, error: checkError } = await admin
      .from('espacio_profesional_mensajes')
      .select('id')
      .eq('professional_id', professional_id)
      .eq('thread_key', thread_key)
      .or(
        `sender_participant_id.eq.${participant.id},receiver_participant_id.eq.${participant.id}`
      )
      .limit(1);

    if (checkError) throw checkError;

    if (!conversationCheck?.length) {
      return NextResponse.json(
        { error: 'No se encontró una conversación válida para responder.' },
        { status: 404 }
      );
    }

    if (String(participant.id) === String(professional.participant_id)) {
      return NextResponse.json(
        { error: 'Esta bandeja es para el usuario interesado. El profesional debe responder desde su ficha.' },
        { status: 400 }
      );
    }

    const { error: insertError } = await admin
      .from('espacio_profesional_mensajes')
      .insert({
        professional_id,
        sender_participant_id: participant.id,
        receiver_participant_id: professional.participant_id,
        thread_key,
        content,
        is_read: false,
        status: 'active',
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      message: 'Respuesta enviada correctamente.',
    });
  } catch (err: any) {
    console.error('Error respondiendo como usuario interesado:', err);

    return NextResponse.json(
      {
        error: 'No se pudo enviar la respuesta. Intenta nuevamente.',
      },
      { status: 500 }
    );
  }
}