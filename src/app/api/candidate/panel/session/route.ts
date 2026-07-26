import { NextResponse, type NextRequest } from "next/server";
import {
  clearCandidatePanelCookie,
  validateCandidatePanelSession,
} from "@/lib/candidatePanelAuth";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonNoStore(
  body: { authenticated: boolean; candidateId?: string; expiresAt?: string },
  init?: ResponseInit
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...init?.headers,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateCandidatePanelSession(req);

    if (!session.ok) {
      const response = jsonNoStore({ authenticated: false }, { status: 200 });
      return clearCandidatePanelCookie(response);
    }

    return jsonNoStore({
      authenticated: true,
      candidateId: session.candidateId,
      expiresAt: session.expiresAt,
    });
  } catch {
    const response = jsonNoStore({ authenticated: false }, { status: 500 });
    return clearCandidatePanelCookie(response);
  }
}
