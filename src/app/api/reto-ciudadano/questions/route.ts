import { randomInt } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  isAllowedParticipantMutationOrigin,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { RETO_PRIZES_ENABLED } from "@/lib/retoGameRules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const QUESTION_ID_MAX = 200;
const PARTY_ID_MAX = 120;

type RetoQuestionRow = {
  id: string;
  level: number;
  lang: string;
  party_id: string | null;
  question: string;
  is_active: boolean;
  created_at: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0, private",
      Pragma: "no-cache",
      Vary: "Origin",
    },
  });
}

function isQuestionId(value: unknown) {
  const id = String(value ?? "").trim();
  return (
    id.length > 0 &&
    id.length <= QUESTION_ID_MAX &&
    !/[\u0000-\u001f\u007f]/.test(id)
  );
}

function cleanPartyId(value: unknown) {
  if (value === null || value === undefined) return null;
  const partyId = String(value).trim();
  if (
    !partyId ||
    partyId.length > PARTY_ID_MAX ||
    /[\u0000-\u001f\u007f]/.test(partyId)
  ) {
    return null;
  }
  return partyId;
}

function hasOnlyKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[]
) {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !service) {
    throw new Error("RETO_QUESTIONS_SERVER_CONFIG_MISSING");
  }

  return createClient(url, service, {
    auth: { persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const level = Number(searchParams.get("level") ?? "1");

    if (![1, 2, 3].includes(level)) {
      return json(
        {
          ok: false,
          code: "RETO_QUESTION_LEVEL_INVALID",
          error: "Parametro invalido: level debe ser 1, 2 o 3.",
        },
        400
      );
    }

    const partyId = cleanPartyId(searchParams.get("partyId"));
    const supabase = supabaseAdmin();

    let query = supabase
      .from("reto_questions")
      .select("id,level,lang,party_id,question,is_active,created_at")
      .eq("level", level)
      .eq("lang", "es")
      .eq("is_active", true)
      .limit(500);

    if ((level === 2 || level === 3) && partyId) {
      query = query.eq("party_id", partyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[reto-practice-questions] question lookup failed");
      return json(
        {
          ok: false,
          code: "RETO_QUESTIONS_UNAVAILABLE",
          error: "No se pudieron cargar las preguntas.",
        },
        503
      );
    }

    const rows: RetoQuestionRow[] = Array.isArray(data)
      ? (data as RetoQuestionRow[])
      : [];

    shuffleInPlace(rows);

    const picked = rows.slice(0, 25).flatMap((row) => {
      const id = String(row.id ?? "").trim();
      const q = String(row.question ?? "").trim();
      if (!isQuestionId(id) || !q) return [];
      return [{ id, q }];
    });

    return json({
      ok: true,
      level,
      count: picked.length,
      source: "supabase",
      partyId: level === 2 || level === 3 ? partyId : null,
      questions: picked,
    });
  } catch {
    console.error("[reto-practice-questions] unexpected GET failure");
    return json(
      {
        ok: false,
        code: "RETO_QUESTIONS_UNAVAILABLE",
        error: "No se pudieron cargar las preguntas.",
      },
      503
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return json(
        {
          ok: false,
          code: "RETO_ORIGIN_FORBIDDEN",
          error: "Origen de solicitud no autorizado.",
        },
        403
      );
    }

    if (RETO_PRIZES_ENABLED) {
      return json(
        {
          ok: false,
          code: "RETO_PRACTICE_VERIFY_DISABLED",
          error: "La verificacion educativa esta deshabilitada durante la modalidad con premio.",
        },
        423
      );
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);
    if (
      !body ||
      !hasOnlyKeys(body, ["question_id", "level", "party_id", "answer"])
    ) {
      return json(
        {
          ok: false,
          code: "RETO_VERIFY_REQUEST_INVALID",
          error: "Solicitud invalida.",
        },
        400
      );
    }

    const questionId = String(body.question_id ?? "").trim();
    const level = Number(body.level);
    const partyId = cleanPartyId(body.party_id);
    const answer = body.answer;

    if (
      !isQuestionId(questionId) ||
      ![1, 2, 3].includes(level) ||
      typeof answer !== "boolean" ||
      ((level === 2 || level === 3) && !partyId)
    ) {
      return json(
        {
          ok: false,
          code: "RETO_VERIFY_REQUEST_INVALID",
          error: "Solicitud invalida.",
        },
        400
      );
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("reto_questions")
      .select("id,level,lang,party_id,answer,note,is_active")
      .eq("id", questionId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[reto-practice-questions] answer verification lookup failed");
      return json(
        {
          ok: false,
          code: "RETO_VERIFY_UNAVAILABLE",
          error: "No se pudo validar la respuesta.",
        },
        503
      );
    }

    if (
      !data ||
      data.is_active !== true ||
      data.lang !== "es" ||
      Number(data.level) !== level ||
      typeof data.answer !== "boolean"
    ) {
      return json(
        {
          ok: false,
          code: "RETO_QUESTION_NOT_FOUND",
          error: "La pregunta no esta disponible.",
        },
        404
      );
    }

    const rowPartyId =
      data.party_id === null ? null : String(data.party_id ?? "").trim();

    if ((level === 2 || level === 3) && rowPartyId !== partyId) {
      return json(
        {
          ok: false,
          code: "RETO_QUESTION_SOURCE_MISMATCH",
          error: "La pregunta no corresponde al origen solicitado.",
        },
        409
      );
    }

    return json({
      ok: true,
      correct: answer === data.answer,
      note:
        data.note === null || data.note === undefined
          ? null
          : String(data.note),
    });
  } catch {
    console.error("[reto-practice-questions] unexpected POST failure");
    return json(
      {
        ok: false,
        code: "RETO_VERIFY_UNAVAILABLE",
        error: "No se pudo validar la respuesta.",
      },
      503
    );
  }
}