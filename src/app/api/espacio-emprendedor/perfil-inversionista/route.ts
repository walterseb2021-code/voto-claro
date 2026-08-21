import "server-only";

import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const INT4_MAX = 2147483647;

const CATEGORIES = new Set([
  "Tecnología",
  "Ventas / Comercio",
  "Inmobiliaria",
  "Construcción",
  "Turismo",
  "Ecología / Medio Ambiente",
  "Agroindustria",
  "Servicios",
  "Otros",
]);

const DEPARTMENTS = new Set([
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
]);

const INVESTOR_TYPES = new Set([
  "Persona natural",
  "Empresa",
  "Fondo o grupo de inversión",
  "Asociación / Cooperativa",
  "Comprador estratégico",
  "Mentor inversionista",
]);

const SUPPORT_TYPES = new Set([
  "Capital",
  "Préstamo",
  "Compra anticipada",
  "Alianza comercial",
  "Mentoría",
  "Contactos comerciales",
  "Distribución",
]);

const PROJECT_STAGES = new Set([
  "Idea inicial",
  "Prototipo",
  "Negocio funcionando",
  "Expansión",
  "Exportación",
]);

const PARTICIPATION_STYLES = new Set([
  "Solo evaluar proyectos",
  "Invertir si el proyecto convence",
  "Participar como socio",
  "Comprar productos o servicios",
  "Ofrecer mentoría",
  "Buscar alianzas comerciales",
]);

const INVESTMENT_HORIZONS = new Set([
  "Corto plazo",
  "Mediano plazo",
  "Largo plazo",
]);

const RISK_LEVELS = new Set(["Bajo", "Medio", "Alto"]);

function readOptionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) {
    return { ok: true as const, value: null as string | null };
  }

  const text = String(value).trim();

  if (!text) {
    return { ok: true as const, value: null as string | null };
  }

  if (text.length > maxLength) {
    return { ok: false as const };
  }

  return { ok: true as const, value: text };
}

function readOptionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null as number | null };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > INT4_MAX) {
    return { ok: false as const };
  }

  return { ok: true as const, value: Math.round(parsed) };
}

function readEnum(value: unknown, allowed: ReadonlySet<string>) {
  const text = String(value ?? "").trim();
  return text && allowed.has(text) ? text : null;
}

function readEnumArray(value: unknown, allowed: ReadonlySet<string>) {
  if (!Array.isArray(value)) {
    return { ok: false as const, value: [] as string[] };
  }

  const normalized = value.map((item) => String(item ?? "").trim());

  if (normalized.some((item) => !item || !allowed.has(item))) {
    return { ok: false as const, value: [] as string[] };
  }

  return {
    ok: true as const,
    value: Array.from(new Set(normalized)),
  };
}

const PROFILE_SELECT = `
  id,
  participant_id,
  company,
  investment_range_min,
  investment_range_max,
  categories,
  departments,
  notify_email,
  investor_type,
  support_types,
  project_stages,
  participation_style,
  investment_horizon,
  risk_level,
  public_message
`;

export async function GET(req: NextRequest) {
  try {
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

    const { data: profile, error: profileError } = await auth.supabase
      .from("espacio_inversionistas")
      .select(PROFILE_SELECT)
      .eq("participant_id", auth.participant.id)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      console.error("[investor-profile] profile lookup failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo cargar tu perfil inversionista.",
      });
    }

    return participantJson(200, {
      ok: true,
      participant: auth.participant,
      profile: profile ?? null,
    });
  } catch {
    console.error("[investor-profile] unexpected GET failure");
    return participantJson(503, {
      ok: false,
      error: "No se pudo cargar tu perfil inversionista.",
    });
  }
}

export async function PUT(req: NextRequest) {
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

    const company = readOptionalText(body.company, 500);
    const publicMessage = readOptionalText(body.public_message, 300);
    const investmentMin = readOptionalPositiveInt(body.investment_range_min);
    const investmentMax = readOptionalPositiveInt(body.investment_range_max);

    if (!company.ok || !publicMessage.ok || !investmentMin.ok || !investmentMax.ok) {
      return participantJson(400, {
        ok: false,
        error: "Uno o más campos del perfil no son válidos.",
      });
    }

    if (
      investmentMin.value !== null &&
      investmentMax.value !== null &&
      investmentMax.value < investmentMin.value
    ) {
      return participantJson(400, {
        ok: false,
        error: "La inversión máxima no puede ser menor que la inversión mínima.",
      });
    }

    const categories = readEnumArray(body.categories, CATEGORIES);
    const departments = readEnumArray(body.departments, DEPARTMENTS);
    const supportTypes = readEnumArray(body.support_types, SUPPORT_TYPES);
    const projectStages = readEnumArray(body.project_stages, PROJECT_STAGES);

    if (!categories.ok || !departments.ok || !supportTypes.ok || !projectStages.ok) {
      return participantJson(400, {
        ok: false,
        error: "Una o más opciones seleccionadas no son válidas.",
      });
    }

    const investorType = readEnum(body.investor_type, INVESTOR_TYPES);
    const participationStyle = readEnum(body.participation_style, PARTICIPATION_STYLES);
    const investmentHorizon = readEnum(body.investment_horizon, INVESTMENT_HORIZONS);
    const riskLevel = readEnum(body.risk_level, RISK_LEVELS);

    if (!investorType) {
      return participantJson(400, {
        ok: false,
        error: "Selecciona el tipo de inversionista.",
      });
    }

    if (supportTypes.value.length === 0) {
      return participantJson(400, {
        ok: false,
        error: "Selecciona al menos un tipo de apoyo que podrías ofrecer.",
      });
    }

    if (projectStages.value.length === 0) {
      return participantJson(400, {
        ok: false,
        error: "Selecciona al menos una etapa de proyecto de tu interés.",
      });
    }

    if (!participationStyle) {
      return participantJson(400, {
        ok: false,
        error: "Selecciona tu forma de participación preferida.",
      });
    }

    if (!investmentHorizon) {
      return participantJson(400, {
        ok: false,
        error: "Selecciona tu horizonte de interés.",
      });
    }

    if (!riskLevel) {
      return participantJson(400, {
        ok: false,
        error: "Selecciona tu nivel de riesgo referencial.",
      });
    }

    if (typeof body.notify_email !== "boolean") {
      return participantJson(400, {
        ok: false,
        error: "La preferencia de notificación no es válida.",
      });
    }

    const payload = {
      participant_id: auth.participant.id,
      company: company.value,
      investment_range_min: investmentMin.value,
      investment_range_max: investmentMax.value,
      categories: categories.value,
      departments: departments.value,
      notify_email: body.notify_email,
      investor_type: investorType,
      support_types: supportTypes.value,
      project_stages: projectStages.value,
      participation_style: participationStyle,
      investment_horizon: investmentHorizon,
      risk_level: riskLevel,
      public_message: publicMessage.value,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await auth.supabase
      .from("espacio_inversionistas")
      .upsert(payload, { onConflict: "participant_id" })
      .select("id")
      .single();

    if (saveError || !saved?.id) {
      console.error("[investor-profile] profile save failed");
      return participantJson(503, {
        ok: false,
        error: "No se pudo guardar el perfil. Intenta nuevamente.",
      });
    }

    return participantJson(200, {
      ok: true,
      profile_id: saved.id,
    });
  } catch {
    console.error("[investor-profile] unexpected PUT failure");
    return participantJson(503, {
      ok: false,
      error: "No se pudo guardar el perfil. Intenta nuevamente.",
    });
  }
}