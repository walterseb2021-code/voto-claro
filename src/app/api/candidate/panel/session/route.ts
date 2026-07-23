import { NextResponse, type NextRequest } from "next/server";
import { validateCandidatePanelSession } from "@/lib/candidatePanelAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await validateCandidatePanelSession(req);

  if (!session.ok) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    candidateId: session.candidateId,
    expiresAt: session.expiresAt,
  });
}
