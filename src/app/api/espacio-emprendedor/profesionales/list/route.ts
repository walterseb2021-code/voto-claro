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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { searchParams } = new URL(req.url);
    const deviceId = String(searchParams.get('device_id') || '').trim();

    let currentParticipantId: string | null = null;

    if (deviceId) {
      const { data: participantData, error: participantError } = await admin
        .from('project_participants')
        .select('id')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (participantError) {
        console.error('Error ubicando participante actual:', participantError);
      }

      currentParticipantId = participantData?.id || null;
    }

    const { data, error } = await admin
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
        service_mode,
        service_mode_note,
        experience_summary,
        public_message,
        document_url,
        is_active,
        status,
        created_at
      `)
      .eq('is_active', true)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const professionals = (data || []).map((item) => ({
      id: item.id,
      codigo_profesional: item.codigo_profesional,
      public_name: item.public_name,
      professional_type: item.professional_type,
      specialties: item.specialties || [],
      services: item.services || [],
      department: item.department,
      province: item.province,
      district: item.district,
      attention_mode: item.attention_mode,
      service_mode: item.service_mode || 'No especificado',
      service_mode_note: item.service_mode_note || null,
      experience_summary: item.experience_summary,
      public_message: item.public_message,
      document_url: item.document_url,
      created_at: item.created_at,
      is_mine:
        !!currentParticipantId &&
        String(item.participant_id || '') === String(currentParticipantId),
    }));

    return NextResponse.json({
      ok: true,
      currentParticipantDetected: !!currentParticipantId,
      professionals,
    });
  } catch (err: any) {
    console.error('Error listando profesionales:', err);

    return NextResponse.json(
      {
        error: 'No se pudo cargar el directorio de profesionales.',
      },
      { status: 500 }
    );
  }
}