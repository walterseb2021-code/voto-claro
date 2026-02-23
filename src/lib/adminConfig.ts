// src/lib/adminConfig.ts
// ✅ Fuente única de verdad para claves/gates de admin en VOTO_CLARO

// ✅ Ya NO usamos clave admin local. El panel admin está protegido por:
// - Supabase Auth (email/password)
// - Cookies server-side (@supabase/ssr)
// - Verificación de ADMIN_EMAIL en proxy.ts y en endpoints admin

// SessionStorage flag: pasó por /pitch en esta sesión (NO persistente)
export const PITCH_DONE_KEY = "votoclaro_pitch_done_v1";