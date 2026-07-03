// src/app/api/admin/capacitaciones/update/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

type TrainingStatus = "active" | "pending" | "inactive" | "rejected";

const ALLOWED_STATUS = new Set(["active", "pending", "inactive", "rejected"]);

function cleanText(value: unknown, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await req.json();

    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40) as TrainingStatus;
    const admin_note = cleanText(body.admin_note, 1200) || null;
    const rejected_reason = cleanText(body.rejected_reason, 1200) || null;

    if (!id) {
      return NextResponse.json(
        { error: "Falta el ID de la capacitación." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        {
          error:
            "Estado inválido. Usa active, pending, inactive o rejected.",
        },
        { status: 400 }
      );
    }

    if (status === "rejected" && !rejected_reason) {
      return NextResponse.json(
        { error: "Para rechazar una publicación debes indicar el motivo." },
        { status: 400 }
      );
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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const updatePayload: Record<string, any> = {
      status,
      admin_note,
      rejected_reason: status === "rejected" ? rejected_reason : null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_admin: true,
    };

    const { data, error } = await admin
      .from("espacio_capacitaciones")
      .update(updatePayload)
      .eq("id", id)
      .select("id, title, status")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "No se encontró la capacitación indicada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Capacitación actualizada a estado ${status}.`,
      capacitacion: data,
    });
  } catch (err: any) {
    console.error("Error admin actualizando capacitación:", err);

    return NextResponse.json(
      {
        error: err?.message || "No se pudo actualizar la capacitación.",
      },
      { status: 500 }
    );
  }
}
