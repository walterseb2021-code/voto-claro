// src/app/api/admin/pin/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  candidateId: string;
  pin: string; // 4 dígitos (string)
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return jsonError(
      "Faltan variables de entorno de Supabase (URL o SERVICE_ROLE). Revisa .env.local",
      500
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Body JSON inválido.");
  }

  const candidateId = String(body.candidateId || "").trim();
  const pin = String(body.pin || "").trim();

  if (!candidateId) return jsonError("candidateId es requerido.");
  if (!/^\d{4}$/.test(pin)) return jsonError("pin debe ser de 4 dígitos.");

  const supabaseAdmin = createClient(url, serviceKey);

  const { error } = await supabaseAdmin
    .from("votoclaro_candidate_pins")
    .upsert(
      { candidate_id: candidateId, pin },
      { onConflict: "candidate_id" }
    );

  if (error) {
    return jsonError(`Supabase error: ${error.message}`, 500);
  }

  return NextResponse.json({ ok: true, candidateId, pin });
}
