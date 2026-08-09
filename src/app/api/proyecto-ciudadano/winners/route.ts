import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
};

function json(
  status: number,
  body: Record<string, unknown>
) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Proyecto Ciudadano winners dependency unavailable.");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function safeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function getLeaderAlias(value: unknown) {
  const leader = Array.isArray(value) ? value[0] : value;

  if (!leader || typeof leader !== "object") {
    return null;
  }

  const alias = safeText(
    (leader as { alias?: unknown }).alias,
    80
  );

  return alias || null;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: previousCycle, error: cycleError } = await supabase
      .from("project_cycles")
      .select("id")
      .eq("is_active", false)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cycleError) {
      console.error("[proyecto-ciudadano-winners] cycle lookup failed");
      return json(503, {
        ok: false,
        error: "winners_unavailable",
      });
    }

    if (!previousCycle?.id) {
      return json(200, {
        ok: true,
        winners: [],
      });
    }

    const { data, error } = await supabase
      .from("projects")
      .select(`
        id,
        name,
        category,
        district,
        department,
        beneficiary_count,
        leader:project_participants!leader_id (
          alias
        )
      `)
      .eq("cycle_id", previousCycle.id)
      .eq("status", "active")
      .order("beneficiary_count", { ascending: false })
      .limit(3);

    if (error) {
      console.error("[proyecto-ciudadano-winners] projects lookup failed");
      return json(503, {
        ok: false,
        error: "winners_unavailable",
      });
    }

    const winners = (data ?? []).map((item) => ({
      id: safeText(item.id, 80),
      name: safeText(item.name, 160),
      category: safeText(item.category, 120),
      district: safeText(item.district, 120),
      department: safeText(item.department, 120),
      beneficiary_count:
        typeof item.beneficiary_count === "number" &&
        Number.isFinite(item.beneficiary_count)
          ? item.beneficiary_count
          : 0,
      leader: {
        alias: getLeaderAlias(item.leader),
      },
    }));

    return json(200, {
      ok: true,
      winners,
    });
  } catch {
    console.error("[proyecto-ciudadano-winners] unexpected failure");
    return json(503, {
      ok: false,
      error: "winners_unavailable",
    });
  }
}