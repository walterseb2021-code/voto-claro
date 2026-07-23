import { NextResponse, type NextRequest } from "next/server";
import {
  clearCandidatePanelCookie,
  revokeCandidatePanelSession,
} from "@/lib/candidatePanelAuth";
import { isAllowedCandidatePanelMutationOrigin } from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  await revokeCandidatePanelSession(req);

  const response = NextResponse.json({ ok: true });
  return clearCandidatePanelCookie(response);
}
