// src/app/api/admin/pin/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { isAllowedCandidatePanelMutationOrigin } from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function jsonError(message: string, status = 400) {
  return jsonResponse({ ok: false, error: message }, status);
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return jsonResponse({ error: gate.error }, gate.status);
  }

  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return jsonError("No autorizado.", 403);
  }

  return jsonError("Endpoint reemplazado por codigo de acceso.", 410);
}
