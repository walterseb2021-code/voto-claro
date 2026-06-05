import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function buildThreadKey(
  professionalId: string,
  participantA: string,
  participantB: string
) {
  const ordered = [String(participantA), String(participantB)].sort();
  return `${professionalId}:${ordered[0]}:${ordered[1]}`;
}

function getSafeSenderName(sender: any) {
  return sender?.alias || sender?.full_name?.split(' ')[0] || 'Participante';
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
        { error: 'No se recibió device_id para identificar al profesional.' },
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
        { error: 'Debes iniciar sesión para ver tus mensajes profesionales.' },
        { status: 401 }
      );
    }

    const { data: professional, error: professionalError } = await admin
      .from('espacio_profesionales')
      .select('id, codigo_profesional, public_name, participant_id')
      .eq('participant_id', participant.id)
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json({
        ok: true,
        professional: null,
        conversations: [],
      });
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
      .eq('professional_id', professional.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    const participantIds = Array.from(
      new Set(
        (messages || [])
          .flatMap((m: any) => [
            m.sender_participant_id,
            m.receiver_participant_id,
          ])
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
      const threadKey =
        msg.thread_key ||
        buildThreadKey(
          professional.id,
          msg.sender_participant_id,
          msg.receiver_participant_id || professional.participant_id
        );

      const otherParticipantId =
        String(msg.sender_participant_id) === String(professional.participant_id)
          ? msg.receiver_participant_id
          : msg.sender_participant_id;

      const otherParticipant = participantMap.get(otherParticipantId);

      if (!conversationMap.has(threadKey)) {
        conversationMap.set(threadKey, {
          thread_key: threadKey,
          professional_id: professional.id,
          other_participant_id: otherParticipantId,
          other_participant_alias: getSafeSenderName(otherParticipant),
          last_message_at: msg.created_at,
          messages: [],
        });
      }

      const conversation = conversationMap.get(threadKey);

      conversation.messages.push({
        id: msg.id,
        content: msg.content,
        is_read: msg.is_read,
        created_at: msg.created_at,
        sender_participant_id: msg.sender_participant_id,
        receiver_participant_id: msg.receiver_participant_id,
        sender_alias: getSafeSenderName(participantMap.get(msg.sender_participant_id)),
        is_from_me:
          String(msg.sender_participant_id) === String(professional.participant_id),
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
      professional: {
        id: professional.id,
        codigo_profesional: professional.codigo_profesional,
        public_name: professional.public_name,
      },
      conversations,
    });
  } catch (err: any) {
    console.error('Error cargando conversaciones del profesional:', err);

    return NextResponse.json(
      {
        error: 'No se pudieron cargar los mensajes recibidos.',
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
    const receiver_participant_id = cleanText(body.receiver_participant_id, 120);
    const content = cleanText(body.content, 1200);

    if (!device_id) {
      return NextResponse.json(
        { error: 'Debes iniciar sesión para responder mensajes.' },
        { status: 400 }
      );
    }

    if (!thread_key || !receiver_participant_id) {
      return NextResponse.json(
        { error: 'No se pudo identificar la conversación o el destinatario.' },
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
        { error: 'Debes iniciar sesión para responder mensajes.' },
        { status: 401 }
      );
    }

    const { data: professional, error: professionalError } = await admin
      .from('espacio_profesionales')
      .select('id, participant_id, is_active, status')
      .eq('participant_id', participant.id)
      .eq('is_active', true)
      .eq('status', 'active')
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json(
        { error: 'Solo el profesional dueño de la ficha puede responder esta conversación.' },
        { status: 403 }
      );
    }

    if (String(professional.participant_id) === String(receiver_participant_id)) {
      return NextResponse.json(
        { error: 'No puedes responderte a ti mismo en esta conversación.' },
        { status: 400 }
      );
    }

    const { data: conversationCheck, error: checkError } = await admin
      .from('espacio_profesional_mensajes')
      .select('id')
      .eq('professional_id', professional.id)
      .eq('thread_key', thread_key)
      .or(
        `sender_participant_id.eq.${receiver_participant_id},receiver_participant_id.eq.${receiver_participant_id}`
      )
      .limit(1);

    if (checkError) throw checkError;

    if (!conversationCheck || conversationCheck.length === 0) {
      return NextResponse.json(
        { error: 'No se encontró una conversación válida para responder.' },
        { status: 404 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from('espacio_profesional_mensajes')
      .insert({
        professional_id: professional.id,
        sender_participant_id: professional.participant_id,
        receiver_participant_id,
        thread_key,
        content,
        is_read: false,
        status: 'active',
      })
      .select('id, created_at')
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      inserted,
      message: 'Respuesta enviada correctamente.',
    });
  } catch (err: any) {
    console.error('Error respondiendo conversación profesional:', err);

    return NextResponse.json(
      {
        error:
          err?.message || 'No se pudo enviar la respuesta. Intenta nuevamente.',
      },
      { status: 500 }
    );
  }
}