import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getParticipantSupabaseAdmin } from "@/lib/participantApi";
import { PROJECT_PDF_BUCKET } from "@/lib/projectSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GRANTS_PER_RUN = 200;

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

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = req.headers.get("authorization") ?? "";

  if (!secret || secret.length < 16) {
    console.error("[project-submission-cleanup] CRON_SECRET unavailable");
    return false;
  }

  const expected = `Bearer ${secret}`;
  const receivedBuffer = Buffer.from(authorization, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return json(401, {
      ok: false,
      error: "unauthorized",
    });
  }

  try {
    const supabase = getParticipantSupabaseAdmin();

    const { data, error } = await supabase
      .from("project_submission_upload_grants")
      .select("id,object_path,expires_at,cancelled_at,finalized_at,project_id")
      .is("finalized_at", null)
      .is("project_id", null)
      .order("created_at", { ascending: true })
      .limit(MAX_GRANTS_PER_RUN);

    if (error) {
      console.error("[project-submission-cleanup] grant lookup failed");
      return json(503, {
        ok: false,
        error: "cleanup_unavailable",
      });
    }

    const now = Date.now();

    const stale = (data ?? []).filter((grant) => {
      const expiresAt = new Date(String(grant.expires_at ?? ""));
      const expired =
        Number.isFinite(expiresAt.getTime()) &&
        expiresAt.getTime() <= now;

      return expired || grant.cancelled_at !== null;
    });

    if (stale.length === 0) {
      return json(200, {
        ok: true,
        stale_grants: 0,
        removed_objects: 0,
      });
    }

    const objectPaths = stale
      .map((grant) => String(grant.object_path ?? "").trim())
      .filter((value) => value.length > 0);

    if (objectPaths.length !== stale.length) {
      console.error("[project-submission-cleanup] unsafe grant object path");
      return json(503, {
        ok: false,
        error: "cleanup_unavailable",
      });
    }

    const { error: removeError } = await supabase.storage
      .from(PROJECT_PDF_BUCKET)
      .remove(objectPaths);

    if (removeError) {
      console.error("[project-submission-cleanup] storage removal failed");
      return json(503, {
        ok: false,
        error: "cleanup_unavailable",
      });
    }

    const ids = stale.map((grant) => grant.id);
    const cancelledAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("project_submission_upload_grants")
      .update({ cancelled_at: cancelledAt })
      .in("id", ids)
      .is("finalized_at", null)
      .is("project_id", null);

    if (updateError) {
      console.error("[project-submission-cleanup] grant update failed");
      return json(503, {
        ok: false,
        error: "cleanup_unavailable",
      });
    }

    return json(200, {
      ok: true,
      stale_grants: stale.length,
      removed_objects: objectPaths.length,
    });
  } catch {
    console.error("[project-submission-cleanup] unexpected failure");
    return json(503, {
      ok: false,
      error: "cleanup_unavailable",
    });
  }
}