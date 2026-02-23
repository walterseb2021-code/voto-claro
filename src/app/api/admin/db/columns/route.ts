import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const table = String(searchParams.get("table") ?? "").trim();
    if (!table) return NextResponse.json({ error: "TABLE_REQUIRED" }, { status: 400 });

    const supabase = supabaseAdmin();

    // Lee columnas desde information_schema
    const { data, error } = await supabase.rpc("vc_list_columns", { p_table: table });

    if (error) {
      return NextResponse.json({ error: "RPC_ERROR", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ table, columns: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: "EXCEPTION", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
