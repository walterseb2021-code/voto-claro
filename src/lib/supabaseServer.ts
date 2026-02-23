// src/lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";
import { getServerGroup } from "./server-group";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

/**
 * Server-only helper.
 * Always returns the active group from HttpOnly cookie `vc_group`.
 */
export function getServerSupabase() {
  const group = getServerGroup();
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  return { supabase, group };
}