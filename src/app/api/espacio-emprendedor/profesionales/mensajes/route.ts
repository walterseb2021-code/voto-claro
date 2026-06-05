import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

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
      .select('id')
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
      .select('id, codigo_profesional, public_name')
      .eq('participant_id', participant.id)
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json({
        ok: true,
        professional: null,
        messages: [],
      });
    }

    const { data: messages, error: messagesError } = await admin
      .from('espacio_profesional_mensajes')
      .select(`
        id,
        content,
        is_read,
        status,
        created_at,
        sender_participant_id
      `)
      .eq('professional_id', professional.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (messagesError) throw messagesError;

    const senderIds = Array.from(
      new Set((messages || []).map((m) => m.sender_participant_id).filter(Boolean))
    );

    const { data: senders } = senderIds.length
      ? await admin
          .from('project_participants')
          .select('id, alias, full_name')
          .in('id', senderIds)
      : { data: [] as any[] };

    const senderMap = new Map<string, any>();

    (senders || []).forEach((sender: any) => {
      senderMap.set(sender.id, sender);
    });

    const safeMessages = (messages || []).map((msg: any) => {
      const sender = senderMap.get(msg.sender_participant_id);

      return {
        id: msg.id,
        content: msg.content,
        is_read: msg.is_read,
        created_at: msg.created_at,
        sender_alias:
          sender?.alias ||
          sender?.full_name?.split(' ')[0] ||
          'Participante',
      };
    });

    return NextResponse.json({
      ok: true,
      professional: {
        id: professional.id,
        codigo_profesional: professional.codigo_profesional,
        public_name: professional.public_name,
      },
      messages: safeMessages,
    });
  } catch (err: any) {
    console.error('Error cargando mensajes del profesional:', err);

    return NextResponse.json(
      {
        error: 'No se pudieron cargar los mensajes recibidos.',
      },
      { status: 500 }
    );
  }
}