import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function cleanUrl(value: unknown) {
  const url = String(value || '').trim().slice(0, 1000);

  if (!url) return '';

  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const device_id = cleanText(body.device_id, 120);
    const title = cleanText(body.title, 180);
    const description = cleanText(body.description, 1000) || null;
    const category = cleanText(body.category, 120);
    const resource_type = cleanText(body.resource_type, 120);
    const resource_url = cleanUrl(body.resource_url);

    if (!device_id) {
      return NextResponse.json(
        { error: 'No se pudo identificar al participante. Inicia sesión nuevamente.' },
        { status: 400 }
      );
    }

    if (!title || title.length < 4) {
      return NextResponse.json(
        { error: 'Debes indicar un título válido para la capacitación.' },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: 'Debes seleccionar una categoría de capacitación.' },
        { status: 400 }
      );
    }

    if (!resource_type) {
      return NextResponse.json(
        { error: 'Debes seleccionar el tipo de recurso educativo.' },
        { status: 400 }
      );
    }

    if (!resource_url) {
      return NextResponse.json(
        {
          error:
            'Debes ingresar un enlace válido que empiece con http:// o https://.',
        },
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
        {
          error:
            'No se encontró tu registro de participante. Primero debes registrarte como participante.',
        },
        { status: 404 }
      );
    }

    const { data: professional, error: professionalError } = await admin
      .from('espacio_profesionales')
      .select('id, participant_id, public_name, status, is_active')
      .eq('participant_id', participant.id)
      .eq('is_active', true)
      .eq('status', 'active')
      .maybeSingle();

    if (professionalError) throw professionalError;

    if (!professional) {
      return NextResponse.json(
        {
          error:
            'Para publicar capacitación gratuita primero debes tener una ficha profesional activa.',
        },
        { status: 403 }
      );
    }

    const { error: insertError } = await admin
      .from('espacio_capacitaciones')
      .insert({
        professional_id: professional.id,
        participant_id: participant.id,
        title,
        description,
        category,
        resource_type,
        resource_url,
        is_free: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      message: 'Capacitación gratuita publicada correctamente.',
    });
  } catch (err: any) {
    console.error('Error publicando capacitación:', err);

    return NextResponse.json(
      {
        error:
          'No se pudo publicar la capacitación. Revisa los datos e intenta nuevamente.',
      },
      { status: 500 }
    );
  }
}