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
      .select('id, alias, codigo_acceso, device_id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (participantError) throw participantError;

    if (!participant) {
      return NextResponse.json({
        ok: true,
        participant: null,
        profile: null,
      });
    }

    const { data: profile, error: profileError } = await admin
      .from('espacio_profesionales')
      .select(`
        id,
        participant_id,
        codigo_profesional,
        public_name,
        professional_type,
        specialties,
        services,
        department,
        province,
        district,
        attention_mode,
        experience_summary,
        public_message,
        document_url,
        data_truth_confirmed,
        terms_accepted,
        is_active,
        status,
        created_at,
        updated_at
      `)
      .eq('participant_id', participant.id)
      .maybeSingle();

    if (profileError) throw profileError;

    return NextResponse.json({
      ok: true,
      participant,
      profile: profile || null,
    });
  } catch (err: any) {
    console.error('Error cargando ficha profesional propia:', err);

    return NextResponse.json(
      {
        error: 'No se pudo cargar tu ficha profesional.',
      },
      { status: 500 }
    );
  }
}