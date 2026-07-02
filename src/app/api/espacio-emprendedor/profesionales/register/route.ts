import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function cleanArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 30);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const participant_id = cleanText(body.participant_id, 80);
    const public_name = cleanText(body.public_name, 120);
    const professional_type = cleanText(body.professional_type, 120);
    const specialties = cleanArray(body.specialties);
    const services = cleanArray(body.services);
    const department = cleanText(body.department, 80) || null;
    const province = cleanText(body.province, 80) || null;
    const district = cleanText(body.district, 80) || null;
    const attention_mode =
      cleanText(body.attention_mode, 80) || 'Virtual y presencial';
    const service_mode = cleanText(body.service_mode, 180) || 'No especificado';
    const service_mode_note = cleanText(body.service_mode_note, 500) || null;
    const educational_activities = cleanArray(body.educational_activities);
    const training_categories = cleanArray(body.training_categories);
    const experience_summary = cleanText(body.experience_summary, 1200) || null;
    const public_message = cleanText(body.public_message, 500) || null;
    const document_url = cleanText(body.document_url, 1000) || null;
    const data_truth_confirmed = Boolean(body.data_truth_confirmed);
    const terms_accepted = Boolean(body.terms_accepted);

    if (!participant_id) {
      return NextResponse.json(
        { error: 'No se pudo identificar al participante. Inicia sesión nuevamente.' },
        { status: 400 }
      );
    }

    if (!public_name) {
      return NextResponse.json(
        { error: 'Debes indicar el nombre público o nombre profesional.' },
        { status: 400 }
      );
    }

    if (!professional_type) {
      return NextResponse.json(
        { error: 'Debes seleccionar el tipo de profesional.' },
        { status: 400 }
      );
    }

    if (specialties.length === 0) {
      return NextResponse.json(
        { error: 'Debes seleccionar al menos una especialidad.' },
        { status: 400 }
      );
    }

    if (services.length === 0) {
      return NextResponse.json(
        { error: 'Debes seleccionar al menos un servicio ofrecido.' },
        { status: 400 }
      );
    }

    if (!service_mode || service_mode === 'No especificado') {
      return NextResponse.json(
        {
          error:
            'Debes indicar si tu asesoría será gratuita, pagada, mixta o pro bono sujeto a evaluación.',
        },
        { status: 400 }
      );
    }

    if (!document_url) {
      return NextResponse.json(
        { error: 'Debes subir un documento PDF de respaldo profesional.' },
        { status: 400 }
      );
    }

    if (!data_truth_confirmed || !terms_accepted) {
      return NextResponse.json(
        {
          error:
            'Debes aceptar las declaraciones obligatorias para registrar tu ficha profesional.',
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
      .eq('id', participant_id)
      .maybeSingle();

    if (participantError) throw participantError;

    if (!participant) {
      return NextResponse.json(
        { error: 'No se encontró el participante asociado a esta ficha.' },
        { status: 404 }
      );
    }

    const { data: existingProfile, error: existingError } = await admin
      .from('espacio_profesionales')
      .select('id, codigo_profesional')
      .eq('participant_id', participant_id)
      .maybeSingle();

    if (existingError) throw existingError;

    const basePayload = {
      participant_id,
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
      educational_activities,
      training_categories,
      experience_summary,
      public_message,
      document_url,
      data_truth_confirmed,
      terms_accepted,
      is_active: true,
      status: 'active',
      updated_at: new Date().toISOString(),
    };

    if (existingProfile?.id) {
      const { error: updateError } = await admin
        .from('espacio_profesionales')
        .update(basePayload)
        .eq('id', existingProfile.id);

      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        mode: 'updated',
        codigo_profesional: existingProfile.codigo_profesional,
        message: 'Ficha profesional actualizada correctamente.',
      });
    }

    const { data: codigoData, error: codigoError } = await admin.rpc(
      'generar_codigo_profesional'
    );

    if (codigoError) throw codigoError;

    const codigo_profesional = String(codigoData || '').trim();

    if (!codigo_profesional) {
      return NextResponse.json(
        { error: 'No se pudo generar el código profesional.' },
        { status: 500 }
      );
    }

    const { error: insertError } = await admin
      .from('espacio_profesionales')
      .insert({
        ...basePayload,
        codigo_profesional,
        created_at: new Date().toISOString(),
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      mode: 'created',
      codigo_profesional,
      message: 'Ficha profesional registrada correctamente.',
    });
  } catch (err: any) {
    console.error('Error registrando profesional:', err);

    const rawMessage = String(err?.message || '');

    if (
      rawMessage.includes('duplicate key') ||
      rawMessage.includes('unique_participant_professional')
    ) {
      return NextResponse.json(
        {
          error:
            'Ya tienes una ficha profesional registrada. Recarga la página y vuelve a guardar para actualizarla.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          'No se pudo guardar la ficha profesional. Revisa los datos e intenta nuevamente.',
      },
      { status: 500 }
    );
  }
}