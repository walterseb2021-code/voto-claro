import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function buildThreadKey(
  professionalId: string,
  senderParticipantId: string,
  receiverParticipantId: string
) {
  const a = String(senderParticipantId);
  const b = String(receiverParticipantId);
  const ordered = [a, b].sort();

  return `${professionalId}:${ordered[0]}:${ordered[1]}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const device_id = cleanText(body.device_id, 120);
    const professional_id = cleanText(body.professional_id, 120);
    const content = cleanText(body.content, 1200);

    if (!device_id) {
      return NextResponse.json(
        { error: 'Debes iniciar sesión o registrarte para contactar a un profesional.' },
        { status: 400 }
      );
    }

    if (!professional_id) {
      return NextResponse.json(
        { error: 'No se pudo identificar al profesional.' },
        { status: 400 }
      );
    }

    if (!content || content.length < 10) {
      return NextResponse.json(
        { error: 'El mensaje debe tener al menos 10 caracteres.' },
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

    const { data: sender, error: senderError } = await admin
      .from('project_participants')
      .select('id')
      .eq('device_id', device_id)
      .maybeSingle();

    if (senderError) throw senderError;

    if (!sender) {
      return NextResponse.json(
        { error: 'Debes registrarte como participante para enviar mensajes.' },
        { status: 401 }
      );
    }

    const { data: professional, error: professionalError } = await admin
      .from('espacio_profesionales')
      .select('id, participant_id, public_name, is_active, status')
      .eq('id', professional_id)
      .eq('is_active', true)
      .eq('status', 'active')
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json(
        { error: 'El profesional no está disponible para recibir mensajes.' },
        { status: 404 }
      );
    }

    const receiverParticipantId = String(professional.participant_id || '');

    if (!receiverParticipantId) {
      return NextResponse.json(
        { error: 'No se pudo identificar al destinatario profesional.' },
        { status: 400 }
      );
    }

    if (String(receiverParticipantId) === String(sender.id)) {
      return NextResponse.json(
        { error: 'No puedes enviarte un mensaje a tu propia ficha profesional.' },
        { status: 400 }
      );
    }

    const threadKey = buildThreadKey(
      professional_id,
      String(sender.id),
      receiverParticipantId
    );

    const { error: insertError } = await admin
      .from('espacio_profesional_mensajes')
      .insert({
        professional_id,
        sender_participant_id: sender.id,
        receiver_participant_id: receiverParticipantId,
        thread_key: threadKey,
        content,
        is_read: false,
        status: 'active',
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      thread_key: threadKey,
      message:
        'Mensaje enviado correctamente. El profesional podrá responderte dentro de la plataforma.',
    });
  } catch (err: any) {
    console.error('Error contactando profesional:', err);

    return NextResponse.json(
      {
        error: 'No se pudo enviar el mensaje al profesional. Intenta nuevamente.',
      },
      { status: 500 }
    );
  }
}