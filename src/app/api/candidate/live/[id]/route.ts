import { NextResponse, type NextRequest } from "next/server";
import {
  getCandidatePanelAdminClient,
  validateCandidatePanelSession,
} from "@/lib/candidatePanelAuth";
import {
  isAllowedCandidatePanelMutationOrigin,
  isJsonContentType,
} from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchBody = {
  status?: unknown;
};

const PATCH_KEYS = new Set(["status"]);

function unauthorized() {
  return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
}

function badRequest() {
  return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
}

function unavailable() {
  return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
}

async function getLiveId(context: RouteContext) {
  const params = await context.params;
  const id = String(params.id ?? "").trim();
  return UUID_RE.test(id) ? id : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  if (!isJsonContentType(req)) return badRequest();

  const id = await getLiveId(context);
  if (!id) return badRequest();

  const session = await validateCandidatePanelSession(req);
  if (!session.ok) return unauthorized();

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return badRequest();
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !PATCH_KEYS.has(key))
  ) {
    return badRequest();
  }

  if (String(body.status ?? "").trim().toUpperCase() !== "ENDED") {
    return badRequest();
  }

  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("votoclaro_live_entries")
    .update({ status: "ENDED" })
    .eq("id", id)
    .eq("candidate_id", session.storageCandidateId)
    .eq("status", "LIVE")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[candidate-live] finish failed", error.message);
    return unavailable();
  }

  if (!data?.id) return badRequest();

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  const id = await getLiveId(context);
  if (!id) return badRequest();

  const session = await validateCandidatePanelSession(req);
  if (!session.ok) return unauthorized();

  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("votoclaro_live_entries")
    .delete()
    .eq("id", id)
    .eq("candidate_id", session.storageCandidateId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[candidate-live] delete failed", error.message);
    return unavailable();
  }

  if (!data?.id) return badRequest();

  return NextResponse.json({ ok: true });
}
