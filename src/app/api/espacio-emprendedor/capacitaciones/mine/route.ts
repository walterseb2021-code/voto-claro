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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = cleanText(searchParams.get('device_id'), 120);

    if (!deviceId) {
      return NextResponse.json(
        { error: 'No se pudo identificar tu sesión. Inicia sesión nuevamente.' },
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
      .select('id, codigo_profesional, public_name')
      .eq('participant_id', participant.id)
      .eq('is_active', true)
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json(
        {
          error:
            'Para administrar capacitaciones primero debes tener una ficha profesional activa.',
        },
        { status: 403 }
      );
    }

    const { data: capacitaciones, error } = await admin
      .from('espacio_capacitaciones')
      .select(
        `
        id,
        professional_id,
        participant_id,
        title,
        description,
        category,
        resource_type,
        resource_url,
        is_free,
        status,
        created_at,
        updated_at,
        admin_note,
        reviewed_at,
        rejected_reason,
        updated_by_admin
      `
      )
      .eq('participant_id', participant.id)
      .eq('professional_id', professional.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      professional,
      count: capacitaciones?.length || 0,
      capacitaciones: capacitaciones || [],
    });
  } catch (err: any) {
    console.error('Error cargando mis capacitaciones:', err);

    return NextResponse.json(
      {
        error:
          err?.message || 'No se pudieron cargar tus capacitaciones publicadas.',
      },
      { status: 500 }
    );
  }
}
