import { NextResponse } from "next/server";
import { getParticipantSupabaseAdmin } from "@/lib/participantApi";
import { getConfiguredProjectCycle } from "@/lib/projectSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

export async function GET() {
  try {
    const supabase = getParticipantSupabaseAdmin();
    const cycleResult = await getConfiguredProjectCycle(supabase);

    if (!cycleResult.ok || !cycleResult.cycle) {
      return json(503, {
        ok: false,
        error: "rules_unavailable",
      });
    }

    return json(200, {
      ok: true,
      minimum_supports: cycleResult.cycle.min_supports,
      submission_open: cycleResult.cycle.submission_open,
    });
  } catch {
    console.error("[project-rules] unexpected failure");
    return json(503, {
      ok: false,
      error: "rules_unavailable",
    });
  }
}