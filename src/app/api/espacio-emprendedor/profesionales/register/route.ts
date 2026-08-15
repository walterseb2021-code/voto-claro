import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  getProfessionalPdfPublicUrl,
  parseOwnedProfessionalPdfPath,
  removeProfessionalPdfObject,
  verifyProfessionalPdfObject,
} from "@/lib/professionalProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

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
        error: "Solicitud inválida.",
      });
    }

    const participantId = auth.participant.id;
    const public_name = cleanText(body.public_name, 120);
    const professional_type = cleanText(body.professional_type, 120);
    const specialties = cleanArray(body.specialties);
    const services = cleanArray(body.services);
    const department = cleanText(body.department, 80) || null;
    const province = cleanText(body.province, 80) || null;
    const district = cleanText(body.district, 80) || null;
    const attention_mode =
      cleanText(body.attention_mode, 80) || "Virtual y presencial";
    const service_mode =
      cleanText(body.service_mode, 180) || "No especificado";
    const service_mode_note =
      cleanText(body.service_mode_note, 500) || null;
    const educational_activities = cleanArray(body.educational_activities);
    const training_categories = cleanArray(body.training_categories);
    const experience_summary =
      cleanText(body.experience_summary, 1200) || null;
    const public_message = cleanText(body.public_message, 500) || null;
    const documentPath = cleanText(body.document_path, 320) || null;
    const data_truth_confirmed = body.data_truth_confirmed === true;
    const terms_accepted = body.terms_accepted === true;

    if (!public_name) {
      return participantJson(400, {
        ok: false,
        error: "Debes indicar el nombre público o nombre profesional.",
      });
    }

    if (!professional_type) {
      return participantJson(400, {
        ok: false,
        error: "Debes seleccionar el tipo de profesional.",
      });
    }

    if (specialties.length === 0) {
      return participantJson(400, {
        ok: false,
        error: "Debes seleccionar al menos una especialidad.",
      });
    }

    if (services.length === 0) {
      return participantJson(400, {
        ok: false,
        error: "Debes seleccionar al menos un servicio ofrecido.",
      });
    }

    if (!service_mode || service_mode === "No especificado") {
      return participantJson(400, {
        ok: false,
        error:
          "Debes indicar si tu asesoría será gratuita, pagada, mixta o pro bono sujeto a evaluación.",
      });
    }

    if (!data_truth_confirmed || !terms_accepted) {
      return participantJson(400, {
        ok: false,
        error: "Debes aceptar las declaraciones obligatorias.",
      });
    }

    const { data: existingProfile, error: existingError } =
      await auth.supabase
        .from("espacio_profesionales")
        .select("id, codigo_profesional, document_url")
        .eq("participant_id", participantId)
        .maybeSingle();

    if (existingError) {
      console.error("[professional-register] profile lookup failed");

      return participantJson(503, {
        ok: false,
        error: "No se pudo revisar tu ficha profesional.",
      });
    }

    let documentUrl =
      typeof existingProfile?.document_url === "string"
        ? existingProfile.document_url.trim()
        : "";

    if (documentPath) {
      const parsedPath = parseOwnedProfessionalPdfPath(
        documentPath,
        participantId
      );

      if (!parsedPath) {
        return participantJson(400, {
          ok: false,
          error: "La ruta del documento profesional no es válida.",
        });
      }

      const verified = await verifyProfessionalPdfObject(
        auth.supabase,
        parsedPath.objectPath,
        participantId
      );

      if (!verified.ok) {
        const verificationUnavailable =
          verified.reason === "lookup_failed" ||
          verified.reason === "signature_unavailable";

        const definitivelyInvalid =
          verified.reason === "size_invalid" ||
          verified.reason === "mime_invalid" ||
          verified.reason === "signature_invalid";

        if (definitivelyInvalid) {
          await removeProfessionalPdfObject(
            auth.supabase,
            parsedPath.objectPath
          );
        }

        return participantJson(verificationUnavailable ? 503 : 400, {
          ok: false,
          error: verificationUnavailable
            ? "No se pudo verificar el PDF en este momento."
            : "El PDF cargado no pudo validarse.",
        });
      }

      const publicUrl = getProfessionalPdfPublicUrl(
        auth.supabase,
        parsedPath.objectPath
      );

      if (!publicUrl) {
        await removeProfessionalPdfObject(
          auth.supabase,
          parsedPath.objectPath
        );

        return participantJson(503, {
          ok: false,
          error: "No se pudo generar la URL pública del documento.",
        });
      }

      documentUrl = publicUrl;
    }

    if (!documentUrl) {
      return participantJson(400, {
        ok: false,
        error: "Debes subir un documento PDF de respaldo profesional.",
      });
    }

    const basePayload = {
      participant_id: participantId,
      public_name,
      professional_type,
      specialties,
      services,
      department,
      province,
      district,
      attention_mode,
      service_mode,
      service_mode_note,
      educational_activities,
      training_categories,
      experience_summary,
      public_message,
      document_url: documentUrl,
      data_truth_confirmed,
      terms_accepted,
      is_active: true,
      status: "active",
      updated_at: new Date().toISOString(),
    };

    if (existingProfile?.id) {
      const { error: updateError } = await auth.supabase
        .from("espacio_profesionales")
        .update(basePayload)
        .eq("id", existingProfile.id)
        .eq("participant_id", participantId);

      if (updateError) {
        if (documentPath) {
          await removeProfessionalPdfObject(auth.supabase, documentPath);
        }

        console.error("[professional-register] profile update failed");

        return participantJson(503, {
          ok: false,
          error:
            "No se pudo actualizar la ficha profesional. Intenta nuevamente.",
        });
      }

      return participantJson(200, {
        ok: true,
        mode: "updated",
        codigo_profesional: existingProfile.codigo_profesional,
        document_url: documentUrl,
        message: "Ficha profesional actualizada correctamente.",
      });
    }

    const { data: codigoData, error: codigoError } =
      await auth.supabase.rpc("generar_codigo_profesional");

    if (codigoError) {
      if (documentPath) {
        await removeProfessionalPdfObject(auth.supabase, documentPath);
      }

      console.error("[professional-register] professional code generation failed");

      return participantJson(503, {
        ok: false,
        error: "No se pudo generar el código profesional.",
      });
    }

    const codigo_profesional = String(codigoData || "").trim();

    if (!codigo_profesional) {
      if (documentPath) {
        await removeProfessionalPdfObject(auth.supabase, documentPath);
      }

      return participantJson(503, {
        ok: false,
        error: "No se pudo generar el código profesional.",
      });
    }

    const { error: insertError } = await auth.supabase
      .from("espacio_profesionales")
      .insert({
        ...basePayload,
        codigo_profesional,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      if (documentPath) {
        await removeProfessionalPdfObject(auth.supabase, documentPath);
      }

      const rawMessage = String(insertError.message || "");

      if (
        rawMessage.includes("duplicate key") ||
        rawMessage.includes("unique_participant_professional")
      ) {
        return participantJson(409, {
          ok: false,
          error:
            "Ya tienes una ficha profesional registrada. Recarga la página e intenta nuevamente.",
        });
      }

      console.error("[professional-register] profile insert failed");

      return participantJson(503, {
        ok: false,
        error:
          "No se pudo guardar la ficha profesional. Revisa los datos e intenta nuevamente.",
      });
    }

    return participantJson(200, {
      ok: true,
      mode: "created",
      codigo_profesional,
      document_url: documentUrl,
      message: "Ficha profesional registrada correctamente.",
    });
  } catch {
    console.error("[professional-register] unexpected failure");

    return participantJson(500, {
      ok: false,
      error:
        "No se pudo guardar la ficha profesional. Revisa los datos e intenta nuevamente.",
    });
  }
}
