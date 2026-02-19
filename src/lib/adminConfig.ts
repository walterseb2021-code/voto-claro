// src/lib/adminConfig.ts
// ✅ Fuente única de verdad para claves/gates de admin en VOTO_CLARO

// Misma clave para todos los paneles admin (demo local)
export const ADMIN_KEY = "VC-ADMIN-2026";

// LocalStorage flag: admin desbloqueado (persistente en el navegador)
export const LS_ADMIN_UNLOCK = "votoclaro_admin_unlocked_v1";

// SessionStorage flag: pasó por /pitch en esta sesión (NO persistente)
export const PITCH_DONE_KEY = "votoclaro_pitch_done_v1";
