import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  createProfessionalPdfPath,
  PROFESSIONAL_PDF_BUCKET,
  validateProfessionalPdfMetadata,
} from "@/lib/professionalProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantJson(403, {
        ok: false,
        error: "Origen de solicitud no autorizado.",
      });
    }

    const auth = await resolveParticipantSession(req);

    if (!auth.ok) {
      return participantJson(
        auth.reason === "unauthenticated" ? 401 : 503,
        {
          ok: false,
          error:
            auth.reason === "unauthenticated"
              ? "Debes iniciar sesión nuevamente."
              : "No se pudo validar tu sesión en este momento.",
        }
      );
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);

    if (!body) {
      return participantJson(400, {
        ok: false,
        error: "Solicitud de carga inválida.",
      });
    }

    const file = validateProfessionalPdfMetadata(
      body.file_name,
      body.file_type,
      body.file_size
    );

    if (!file) {
      return participantJson(400, {
        ok: false,
        error: "El documento debe ser un PDF válido de hasta 10 MB.",
      });
    }

    const objectPath = createProfessionalPdfPath(auth.participant.id);

    const { data: signed, error: signedError } = await auth.supabase.storage
      .from(PROFESSIONAL_PDF_BUCKET)
      .createSignedUploadUrl(objectPath, {
        upsert: false,
      });

    if (signedError || !signed?.token) {
      console.error("[professional-upload] signed upload creation failed");

      return participantJson(503, {
        ok: false,
        error: "No se pudo preparar la carga segura del PDF.",
      });
    }

    return participantJson(200, {
      ok: true,
      path: objectPath,
      token: signed.token,
    });
  } catch {
    console.error("[professional-upload] unexpected failure");

    return participantJson(500, {
      ok: false,
      error: "No se pudo preparar la carga segura del PDF.",
    });
  }
}
