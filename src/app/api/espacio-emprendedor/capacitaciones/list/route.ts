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
    const category = String(searchParams.get('category') || '').trim();

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let query = admin
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
        updated_at
      `
      )
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: capacitaciones, error } = await query;

    if (error) throw error;

    const professionalIds = Array.from(
      new Set((capacitaciones || []).map((item: any) => item.professional_id))
    ).filter(Boolean);

    let professionalsById: Record<string, any> = {};

    if (professionalIds.length > 0) {
      const { data: professionals, error: professionalsError } = await admin
        .from('espacio_profesionales')
        .select(
          `
          id,
          codigo_profesional,
          public_name,
          professional_type,
          department,
          province,
          district,
          attention_mode,
          service_mode,
          service_mode_note
        `
        )
        .in('id', professionalIds);

      if (professionalsError) throw professionalsError;

      professionalsById = Object.fromEntries(
        (professionals || []).map((professional: any) => [
          professional.id,
          professional,
        ])
      );
    }

    const items = (capacitaciones || []).map((item: any) => {
      const professional = professionalsById[item.professional_id] || null;

      return {
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        resource_type: item.resource_type,
        resource_url: item.resource_url,
        is_free: item.is_free,
        created_at: item.created_at,
        professional: professional
          ? {
              id: professional.id,
              codigo_profesional: professional.codigo_profesional,
              public_name: professional.public_name,
              professional_type: professional.professional_type,
              department: professional.department,
              province: professional.province,
              district: professional.district,
              attention_mode: professional.attention_mode,
              service_mode: professional.service_mode,
              service_mode_note: professional.service_mode_note,
            }
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      category: category || null,
      count: items.length,
      capacitaciones: items,
    });
  } catch (err: any) {
    console.error('Error listando capacitaciones:', err);

    return NextResponse.json(
      {
        error: 'No se pudo cargar la lista de capacitaciones.',
      },
      { status: 500 }
    );
  }
}