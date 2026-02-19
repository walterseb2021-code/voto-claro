// src/app/admin/live/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CANDIDATE_GROUPS } from "@/lib/perufederalCandidates";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_KEY, LS_ADMIN_UNLOCK, PITCH_DONE_KEY } from "@/lib/adminConfig";

// ===============================
// ✅ Storage keys (demo PRO)
// ===============================
type LivePlatform = "YOUTUBE" | "FACEBOOK" | "TIKTOK" | "OTRA";

type CandidatePin = {
  candidateId: string;
  pin: string; // 4 dígitos
  createdAt: number;
  updatedAt: number;
};

type LiveEntry = {
  id: string;
  candidateId: string;
  candidateName: string;
  platform: LivePlatform;
  url: string;
  createdAt: number;
  status: "LIVE" | "ENDED";
};

const LS_LIVE_KEY = "votoclaro_live_entries_v1";
const LS_PINS_KEY = "votoclaro_live_pins_v1";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readPins(): CandidatePin[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<CandidatePin[]>(
    window.localStorage.getItem(LS_PINS_KEY),
    []
  );
}

function writePins(pins: CandidatePin[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_PINS_KEY, JSON.stringify(pins));
}

function readLives(): LiveEntry[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<LiveEntry[]>(
    window.localStorage.getItem(LS_LIVE_KEY),
    []
  );
}

function platformLabel(p: LivePlatform) {
  switch (p) {
    case "YOUTUBE":
      return "YouTube";
    case "FACEBOOK":
      return "Facebook";
    case "TIKTOK":
      return "TikTok";
    default:
      return "Otra";
  }
}

function genPin4(): string {
  // 1000–9999 para evitar PINs tipo 0001
  const n = Math.floor(1000 + Math.random() * 9000);
  return String(n);
}

export default function AdminLivePage() {
  const router = useRouter();
    const PROD_ORIGIN = "https://voto-claro.vercel.app";

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://voto-claro.vercel.app";

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  // ===============================
  // ✅ Gate simple (solo tú)
  // ===============================
 const [adminUnlocked, setAdminUnlocked] = useState(false);
const [adminKeyInput, setAdminKeyInput] = useState("");

useEffect(() => {
  if (typeof window === "undefined") return;

  // ✅ primero: debe haber pasado por /pitch en esta sesión
  const pitchOk = sessionStorage.getItem(PITCH_DONE_KEY) === "1";
  if (!pitchOk) {
    setAdminUnlocked(false);
    return;
  }

  // ✅ segundo: si ya desbloqueaste admin antes, queda guardado
  const ok = window.localStorage.getItem(LS_ADMIN_UNLOCK) === "1";
  setAdminUnlocked(ok);
}, []);

function unlockAdmin() {
  // ✅ exige sesión pitch
  const pitchOk = typeof window !== "undefined" && sessionStorage.getItem(PITCH_DONE_KEY) === "1";
  if (!pitchOk) {
    alert("Acceso no autorizado. Debes ingresar desde /pitch.");
    return;
  }

  if (adminKeyInput.trim() === ADMIN_KEY) {
    window.localStorage.setItem(LS_ADMIN_UNLOCK, "1");
    setAdminUnlocked(true);
  } else {
    alert("Clave incorrecta.");
  }
}

 
  // ===============================
  // ✅ Data candidates (DEDUP por id)
  // ===============================
  const candidatesFlat = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();

    for (const g of CANDIDATE_GROUPS) {
      for (const c of g.candidates) {
        const id = String(c.id);
        const name = String(c.name);

        // ✅ Si el id ya existe, NO lo volvemos a meter
        // (evita duplicados entre categorías/grupos)
        if (!map.has(id)) {
          map.set(id, { id, name });
        } else {
          // opcional: si quieres, podrías actualizar el nombre si el nuevo es más largo/mejor
          // const prev = map.get(id)!;
          // if (name.length > prev.name.length) map.set(id, { id, name });
        }
      }
    }

    const all = Array.from(map.values());
    return all.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, []);

  const [q, setQ] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return candidatesFlat
      .filter((x) => x.name.toLowerCase().includes(s))
      .slice(0, 10);
  }, [q, candidatesFlat]);

  // ===============================
  // ✅ Load pins + lives
  // ===============================
  const [pins, setPins] = useState<CandidatePin[]>([]);
  const [lives, setLives] = useState<LiveEntry[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Pines (aún local por ahora; ya los estamos guardando en Supabase también)
    setPins(readPins());

    async function loadLivesFromSupabase() {
      const { data, error } = await supabase
        .from("votoclaro_live_entries")
        .select("id,candidate_id,candidate_name,platform,url,status,created_at")
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) {
        console.warn(
          "[VOTO CLARO] Error leyendo lives desde Supabase:",
          error.message
        );
        // Fallback: lo local
        setLives(readLives());
        return;
      }

      const serverLives: LiveEntry[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        candidateId: String(r.candidate_id),
        candidateName: String(r.candidate_name),
        platform: r.platform as LivePlatform,
        url: String(r.url),
        status: r.status as "LIVE" | "ENDED",
        createdAt: new Date(r.created_at).getTime(),
      }));

      setLives(serverLives);
    }

    // Carga inicial desde Supabase
    void loadLivesFromSupabase();

    // Si el admin hace cambios locales (demo antigua), refrescamos al toque
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_PINS_KEY) setPins(readPins());
      if (e.key === LS_LIVE_KEY) {
        // Preferimos Supabase como fuente de verdad
        void loadLivesFromSupabase();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
    // ===============================
  // ✅ NUEVO: Realtime en Admin (solo candidato seleccionado)
  // ===============================
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Si aún no hay candidato seleccionado, no hacemos subscribe
    if (!selectedCandidateId) {
      return () => {};
    }

    function mapRowToLiveEntry(r: any): LiveEntry {
      return {
        id: String(r.id),
        candidateId: String(r.candidate_id),
        candidateName: String(r.candidate_name),
        platform: r.platform as LivePlatform,
        url: String(r.url),
        status: r.status as "LIVE" | "ENDED",
        createdAt: new Date(r.created_at).getTime(),
      };
    }

    const channel = supabase
      .channel(`vc-admin-live-${selectedCandidateId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votoclaro_live_entries",
          filter: `candidate_id=eq.${selectedCandidateId}`,
        },
        (payload: any) => {
          // DELETE
          if (payload.eventType === "DELETE") {
            const deletedId = String(payload.old?.id ?? "");
            if (!deletedId) return;
            setLives((prev) => prev.filter((x) => x.id !== deletedId));
            return;
          }

          // INSERT / UPDATE
          const row = payload.new;
          if (!row) return;

          const incoming = mapRowToLiveEntry(row);

          setLives((prev) => {
            const idx = prev.findIndex((x) => x.id === incoming.id);
            let next: LiveEntry[];

            if (idx >= 0) {
              next = prev.map((x) => (x.id === incoming.id ? incoming : x));
            } else {
              next = [incoming, ...prev];
            }

            next = next.sort((a, b) => b.createdAt - a.createdAt);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedCandidateId]);

  const selectedCandidate = useMemo(() => {
    if (!selectedCandidateId) return null;
    return candidatesFlat.find((x) => x.id === selectedCandidateId) ?? null;
  }, [selectedCandidateId, candidatesFlat]);

  const selectedPin = useMemo(() => {
    if (!selectedCandidateId) return null;
    return pins.find((p) => p.candidateId === selectedCandidateId) ?? null;
  }, [pins, selectedCandidateId]);

  const selectedHistory = useMemo(() => {
    if (!selectedCandidateId) return [];
    return lives
      .filter((x) => x.candidateId === selectedCandidateId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [lives, selectedCandidateId]);

  function ensurePin(candidateId: string): CandidatePin {
    const now = Date.now();
    const existing = pins.find((p) => p.candidateId === candidateId);
    if (existing) return existing;

    const created: CandidatePin = {
      candidateId,
      pin: genPin4(),
      createdAt: now,
      updatedAt: now,
    };
    const next = [created, ...pins];
    setPins(next);
    writePins(next);

    // ✅ Sync a Supabase (entre dispositivos)
    void persistPinToServer(candidateId, created.pin);

    return created;
  }

  function regeneratePin(candidateId: string) {
    const now = Date.now();
    const next = pins.map((p) =>
      p.candidateId === candidateId
        ? { ...p, pin: genPin4(), updatedAt: now }
        : p
    );

    // si no existía, lo creamos
    const exists = next.some((p) => p.candidateId === candidateId);
    const finalPins = exists
      ? next
      : [{ candidateId, pin: genPin4(), createdAt: now, updatedAt: now }, ...next];

    setPins(finalPins);
    writePins(finalPins);

    // ✅ Sync a Supabase (entre dispositivos)
    const latest = finalPins.find((p) => p.candidateId === candidateId);
    if (latest) void persistPinToServer(candidateId, latest.pin);
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => alert("Copiado ✅"),
      () => alert("No se pudo copiar. Copia manualmente.")
    );
  }

  async function persistPinToServer(candidateId: string, pin: string) {
    try {
      const res = await fetch("/api/admin/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, pin }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(
          "[VOTO CLARO] No se pudo guardar PIN en Supabase:",
          res.status,
          txt
        );
      }
    } catch (err) {
      console.warn("[VOTO CLARO] Error de red guardando PIN en Supabase:", err);
    }
  }

  // ===============================
  // ✅ NUEVO (PASO 2): BORRADO DESDE ADMIN (SUPABASE)
  // ===============================
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  async function deleteSingleLive(entry: LiveEntry) {
    const ok = window.confirm(
      `¿Eliminar este video del historial?\n\n${entry.url}\n\nEsto lo borra de Supabase (global).`
    );
    if (!ok) return;

    setDeletingId(entry.id);
    try {
      const { error } = await supabase
        .from("votoclaro_live_entries")
        .delete()
        .eq("id", entry.id);

      if (error) {
        alert("No se pudo eliminar. Revisa consola.");
        console.warn("[VOTO CLARO] Error eliminando live (single):", error.message);
        return;
      }

      // ✅ UI inmediata: quitamos del estado sin tocar lo demás
      setLives((prev) => prev.filter((x) => x.id !== entry.id));
    } catch (err) {
      alert("Error de red eliminando. Revisa consola.");
      console.warn("[VOTO CLARO] Error de red eliminando live (single):", err);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteAllLivesForCandidate(candidateId: string, candidateName: string) {
    const ok = window.confirm(
      `¿ELIMINAR TODO el historial de este candidato?\n\n${candidateName}\n\nEsto borra TODOS sus registros en Supabase (global).`
    );
    if (!ok) return;

    setDeletingAll(true);
    try {
      const { error } = await supabase
        .from("votoclaro_live_entries")
        .delete()
        .eq("candidate_id", candidateId);

      if (error) {
        alert("No se pudo eliminar todo. Revisa consola.");
        console.warn("[VOTO CLARO] Error eliminando live (all):", error.message);
        return;
      }

      // ✅ UI inmediata
      setLives((prev) => prev.filter((x) => x.candidateId !== candidateId));
    } catch (err) {
      alert("Error de red eliminando todo. Revisa consola.");
      console.warn("[VOTO CLARO] Error de red eliminando live (all):", err);
    } finally {
      setDeletingAll(false);
    }
  }

  // ===============================
  // ✅ UI styles (coherente verde/rojo)
  // ===============================
  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm";
  const btnSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition shadow-sm";

  // ✅ NUEVO: botón peligro (solo visual; no toca estilos globales)
  const btnDangerSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-red-700 text-white text-xs font-extrabold " +
    "hover:bg-red-800 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  const input =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-3 " +
    "text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600";

  if (!adminUnlocked) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – EN VIVO (VOTO CLARO)
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">
              Acceso privado
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Ingresa tu clave de administrador para ver PINs y gestionar enlaces.
            </div>

            <input
              value={adminKeyInput}
              onChange={(e) => setAdminKeyInput(e.target.value)}
              placeholder="Clave admin"
              className={input}
            />

            <button type="button" onClick={unlockAdmin} className={btn + " mt-3"}>
              Entrar
            </button>

            <div className="mt-3 text-xs text-slate-600">
              Nota: esta clave es local (demo PRO). Luego la hacemos 100% segura con
              servidor.
            </div>
          </div>
        </section>

        <button type="button" onClick={goBack} className={btn + " mt-4"}>
          ← Volver
        </button>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – EN VIVO (VOTO CLARO)
        </h1>

        <button type="button" onClick={goBack} className={btn}>
          ← Volver
        </button>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="text-sm font-extrabold text-slate-900">Buscar candidato</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Escribe nombre: Massé, Acuña, Chiabra..."
            className={input}
          />

          {suggestions.length > 0 ? (
            <div className="mt-2 rounded-2xl border-2 border-red-600 bg-green-50/70 p-2">
              {suggestions.map((c, idx) => (
                <button
                  key={`${c.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedCandidateId(c.id);
                    setQ(c.name);
                    ensurePin(c.id);
                  }}
                  className="w-full text-left rounded-xl px-3 py-2 hover:bg-green-100 transition text-sm font-extrabold text-slate-900"
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          {!selectedCandidate ? (
            <div className="mt-4 text-sm font-semibold text-slate-700">
              Selecciona un candidato para ver su PIN y su panel.
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4">
              <div className="text-sm font-extrabold text-slate-900">
                Candidato seleccionado
              </div>

              <div className="mt-1 text-base md:text-lg font-extrabold text-slate-900 break-words">
                {selectedCandidate.name}
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border-2 border-red-600 bg-white/85 p-3">
                  <div className="text-xs font-extrabold text-slate-700">
                    Panel del candidato (privado)
                  </div>

                  <div className="mt-1 text-[12px] text-slate-700 break-words">
                    /panel/candidato/{selectedCandidate.id}
                  </div>

                  <div className="mt-2 flex gap-2 flex-wrap">
                  <Link
  href={`${PROD_ORIGIN}/panel/candidato/${selectedCandidate.id}`}
  className={btnSm}
  target="_blank"
  rel="noreferrer"
>
  Abrir panel
</Link>

                    <button
  type="button"
  onClick={() => copy(`${PROD_ORIGIN}/panel/candidato/${selectedCandidate.id}`)}
  className={btnSm}
>
  Copiar link
</button>

                  </div>
                </div>

                <div className="rounded-2xl border-2 border-red-600 bg-white/85 p-3">
                  <div className="text-xs font-extrabold text-slate-700">
                    PIN (4 dígitos)
                  </div>

                  <div className="mt-1 text-2xl font-extrabold text-slate-900 tracking-widest">
                    {selectedPin?.pin ?? "----"}
                  </div>

                  <div className="mt-2 flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => selectedPin?.pin && copy(selectedPin.pin)}
                      className={btnSm}
                    >
                      Copiar PIN
                    </button>

                    <button
                      type="button"
                      onClick={() => regeneratePin(selectedCandidate.id)}
                      className={btnSm}
                      title="Si se filtró, regeneras y el PIN anterior queda inválido"
                    >
                      Regenerar PIN
                    </button>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-600">
                    No vence automáticamente. Solo cambia cuando tú lo regeneras.
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/85 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-extrabold text-slate-700">
                    Historial del candidato (admin)
                  </div>

                  {/* ✅ NUEVO: Eliminar todo (solo si hay historial) */}
                  {selectedHistory.length > 0 ? (
                    <button
                      type="button"
                      className={btnDangerSm}
                      disabled={deletingAll}
                      onClick={() =>
                        deleteAllLivesForCandidate(
                          selectedCandidate.id,
                          selectedCandidate.name
                        )
                      }
                      title="Elimina todo el historial del candidato (global en Supabase)"
                    >
                      {deletingAll ? "Eliminando..." : "🗑️ Eliminar TODO"}
                    </button>
                  ) : null}
                </div>

                {selectedHistory.length === 0 ? (
                  <div className="mt-2 text-sm font-semibold text-slate-700">
                    Sin transmisiones registradas aún.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedHistory.map((x) => (
                      <div
                        key={x.id}
                        className="rounded-2xl border-2 border-red-600 bg-green-50/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="text-xs font-extrabold text-slate-800">
                            {new Date(x.createdAt).toLocaleString("es-PE")} ·{" "}
                            {platformLabel(x.platform)} ·{" "}
                            {x.status === "LIVE" ? "🔴 EN VIVO" : "Finalizado"}
                          </div>

                          {/* ✅ NUEVO: Eliminar individual */}
                          <button
                            type="button"
                            className={btnDangerSm}
                            disabled={deletingAll || deletingId === x.id}
                            onClick={() => deleteSingleLive(x)}
                            title="Eliminar este registro (global en Supabase)"
                          >
                            {deletingId === x.id ? "Eliminando..." : "🗑️ Eliminar"}
                          </button>
                        </div>

                        <div className="mt-1 text-[11px] text-slate-600 break-words">
                          {x.url}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
