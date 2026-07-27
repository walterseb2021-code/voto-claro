import { NextResponse, type NextRequest } from "next/server";
import { getCandidatePanelAdminClient } from "@/lib/candidatePanelAuth";
import { resolveCandidatePanelIdentity } from "@/lib/candidatePanelCatalog";

export const runtime = "nodejs";

type CredentialAvailabilityRow = {
  credential_status: string | null;
  access_code_verifier: string | null;
};

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

function jsonNoStore(body: { accessAvailable: boolean }, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

function hasActiveAccess(row: CredentialAvailabilityRow | null) {
  return (
    row?.credential_status === "ACTIVE" &&
    typeof row?.access_code_verifier === "string" &&
    row.access_code_verifier.trim().length > 0
  );
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const entries = Array.from(searchParams.entries());
    const candidateIds = searchParams.getAll("candidateId");

    if (
      entries.length !== 1 ||
      candidateIds.length !== 1 ||
      typeof candidateIds[0] !== "string"
    ) {
      return jsonNoStore({ accessAvailable: false }, 400);
    }

    const candidateIdInput = candidateIds[0].trim();
    if (
      !candidateIdInput ||
      candidateIdInput.length > 160 ||
      /[\u0000-\u001f]/.test(candidateIdInput)
    ) {
      return jsonNoStore({ accessAvailable: false }, 400);
    }

    const candidate = resolveCandidatePanelIdentity(candidateIdInput);
    if (!candidate) {
      return jsonNoStore({ accessAvailable: false });
    }

    const supabase = getCandidatePanelAdminClient();
    const { data, error } = await supabase
      .from("votoclaro_candidate_pins")
      .select("credential_status,access_code_verifier")
      .eq("candidate_id", candidate.storageCandidateId)
      .maybeSingle<CredentialAvailabilityRow>();

    if (error) {
      console.error("[candidate-panel] access availability lookup failed");
      return jsonNoStore({ accessAvailable: false }, 503);
    }

    return jsonNoStore({ accessAvailable: hasActiveAccess(data ?? null) });
  } catch {
    console.error("[candidate-panel] access availability check failed");
    return jsonNoStore({ accessAvailable: false }, 503);
  }
}
