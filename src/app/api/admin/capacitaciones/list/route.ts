// src/app/api/admin/capacitaciones/list/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);

    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = String(searchParams.get("status") || "").trim();

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let query = admin
      .from("espacio_capacitaciones")
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
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && ["active", "pending", "inactive", "rejected"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data: capacitaciones, error } = await query;

    if (error) throw error;

    const professionalIds = Array.from(
      new Set((capacitaciones || []).map((item: any) => item.professional_id))
    ).filter(Boolean);

    let professionalsById: Record<string, any> = {};

    if (professionalIds.length > 0) {
      const { data: professionals, error: professionalError } = await admin
        .from("espacio_profesionales")
        .select(
          `
          id,
          codigo_profesional,
          public_name,
          professional_type,
          department,
          province,
          district
        `
        )
        .in("id", professionalIds);

      if (professionalError) throw professionalError;

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
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
        admin_note: item.admin_note,
        reviewed_at: item.reviewed_at,
        rejected_reason: item.rejected_reason,
        updated_by_admin: item.updated_by_admin,
        professional: professional
          ? {
              id: professional.id,
              codigo_profesional: professional.codigo_profesional,
              public_name: professional.public_name,
              professional_type: professional.professional_type,
              department: professional.department,
              province: professional.province,
              district: professional.district,
            }
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      count: items.length,
      capacitaciones: items,
    });
  } catch (err: any) {
    console.error("Error admin listando capacitaciones:", err);

    return NextResponse.json(
      {
        error:
          err?.message || "No se pudo cargar la administración de capacitaciones.",
      },
      { status: 500 }
    );
  }
}
