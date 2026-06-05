import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown, max = 1000) {
  return String(value || '').trim().slice(0, max);
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

    if (String(professional.participant_id) === String(sender.id)) {
      return NextResponse.json(
        { error: 'No puedes enviarte un mensaje a tu propia ficha profesional.' },
        { status: 400 }
      );
    }

    const { error: insertError } = await admin
      .from('espacio_profesional_mensajes')
      .insert({
        professional_id,
        sender_participant_id: sender.id,
        content,
        is_read: false,
        status: 'active',
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      message:
        'Mensaje enviado correctamente. El profesional podrá revisarlo dentro de la plataforma.',
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