import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const deviceId = cleanText(body.device_id, 120);
    const capacitacionId = cleanText(body.capacitacion_id, 120);

    if (!deviceId) {
      return NextResponse.json(
        { error: 'No se pudo identificar tu sesión. Inicia sesión nuevamente.' },
        { status: 400 }
      );
    }

    if (!capacitacionId) {
      return NextResponse.json(
        { error: 'No se pudo identificar la capacitación que deseas desactivar.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: participant, error: participantError } = await admin
      .from('project_participants')
      .select('id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (participantError) throw participantError;

    if (!participant) {
      return NextResponse.json(
        { error: 'No se encontró tu registro de participante.' },
        { status: 404 }
      );
    }

    const { data: professional, error: professionalError } = await admin
      .from('espacio_profesionales')
      .select('id')
      .eq('participant_id', participant.id)
      .eq('is_active', true)
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json(
        {
          error:
            'Para desactivar capacitaciones primero debes tener una ficha profesional activa.',
        },
        { status: 403 }
      );
    }

    const { data: updated, error: updateError } = await admin
      .from('espacio_capacitaciones')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
        updated_by_admin: false,
      })
      .eq('id', capacitacionId)
      .eq('participant_id', participant.id)
      .eq('professional_id', professional.id)
      .select('id, title, status, updated_at')
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updated) {
      return NextResponse.json(
        { error: 'No se encontró una capacitación tuya con ese identificador.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Capacitación desactivada correctamente.',
      capacitacion: updated,
    });
  } catch (err: any) {
    console.error('Error desactivando capacitación:', err);

    return NextResponse.json(
      {
        error:
          err?.message || 'No se pudo desactivar la capacitación. Intenta nuevamente.',
      },
      { status: 500 }
    );
  }
}
