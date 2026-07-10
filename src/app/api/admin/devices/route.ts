import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ParticipantRow = {
  device_id: string;
  created_at: string;
  email: string | null;
  celular: string | null;
  forum_alias: string | null;
};

function jsonError(message = "No disponible", status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase admin configuration");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanDeviceId(value: unknown) {
  return String(value ?? "").trim();
}

function isValidDeviceId(value: string) {
  return value.length > 0 && value.length <= 200;
}

async function countByDevice(
  admin: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  deviceId: string
) {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("device_id", deviceId);

  if (error) {
    console.error("[admin/devices] count failed", { table, error });
    throw new Error("count failed");
  }

  return count ?? 0;
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const admin = getSupabaseAdmin();

    const { data: participants, error } = await admin
      .from("comment_access_participants")
      .select("device_id, created_at, email, celular, forum_alias")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[admin/devices] participant lookup failed", error);
      return jsonError();
    }

    const devices = await Promise.all(
      ((participants ?? []) as ParticipantRow[]).map(async (p) => ({
        device_id: p.device_id,
        created_at: p.created_at,
        email: p.email,
        celular: p.celular,
        forum_alias: p.forum_alias,
        voteCount: await countByDevice(admin, "vote_intention_answers", p.device_id),
        commentCount: await countByDevice(
          admin,
          "archived_topic_forum_comments",
          p.device_id
        ),
        retoCount: await countByDevice(admin, "reto_ganadores", p.device_id),
      }))
    );

    return NextResponse.json({ devices });
  } catch (e) {
    console.error("[admin/devices] GET unexpected error", e);
    return jsonError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? "").trim();
    const deviceId = cleanDeviceId(body?.device_id);

    if (action !== "reset-device" || !isValidDeviceId(deviceId)) {
      return jsonError("Solicitud invalida", 400);
    }

    const admin = getSupabaseAdmin();
    const tables = [
      "vote_intention_answers",
      "archived_topic_forum_comments",
      "reto_ganadores",
      "comment_access_participants",
    ];

    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq("device_id", deviceId);

      if (error) {
        console.error("[admin/devices] reset failed", { table, error });
        return jsonError("No se pudo resetear");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/devices] POST unexpected error", e);
    return jsonError("No se pudo resetear");
  }
}
