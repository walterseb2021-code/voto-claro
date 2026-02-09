// src/app/panel/candidato/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { CANDIDATE_GROUPS } from "@/lib/perufederalCandidates";
import { supabase } from "@/lib/supabaseClient";

// ===============================
// ✅ Storage keys (demo PRO)
// ===============================
type LivePlatform = "YOUTUBE" | "FACEBOOK" | "TIKTOK" | "OTRA";

type CandidatePin = {
  candidateId: string;
  pin: string;
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
const LS_PANEL_UNLOCK_PREFIX = "votoclaro_panel_unlocked_";

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

function readLives(): LiveEntry[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<LiveEntry[]>(
    window.localStorage.getItem(LS_LIVE_KEY),
    []
  );
}

function writeLives(entries: LiveEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_LIVE_KEY, JSON.stringify(entries));
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

function isValidUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function genId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function normId(input: string) {
  // 1) Asegura decodificación (por si llega %C3%B1, etc.)
  let s = String(input || "");
  try {
    s = decodeURIComponent(s);
  } catch {
    // si no estaba codificado, seguimos normal
  }

  // 2) Normaliza: minúsculas + quita tildes/diacríticos (incluye ñ -> n)
  s = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 3) Limpieza suave
  s = s.replace(/\s+/g, "-");

  return s;
}

export default function CandidatePanelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goBack() {
    // 1) Prioridad: returnTo (flujo controlado)
    const returnTo = searchParams.get("returnTo");
    if (returnTo && returnTo.startsWith("/")) {
      router.push(returnTo);
      return;
    }

    // 2) Referrer inteligente (misma web), evitando volver a pantallas no deseadas
    if (typeof window !== "undefined") {
      const ref = document.referrer || "";
      const origin = window.location.origin;

      if (ref.startsWith(origin)) {
        try {
          const u = new URL(ref);
          const path = u.pathname + u.search + u.hash;

          // evita volver a presentaciones/splash (ajusta si tu ruta real es otra)
          const blocked =
            path === "/" ||
            path.startsWith("/bienvenida") ||
            path.includes("splash");

          if (!blocked) {
            router.push(path);
            return;
          }
        } catch {
          // si falla el parse, seguimos con fallback
        }
      }

      // 3) Solo si no tenemos referrer útil, intentamos back()
      if (window.history.length > 1) {
        router.back();
        return;
      }
    }

    // 4) Fallback seguro
    router.push("/");
  }

const params = useParams<{ id: string }>();

// 1) ID que viene por URL (decodificado)
const candidateIdUrlRaw = String(params?.id ?? "");
let candidateIdUrlDecoded = candidateIdUrlRaw;
try {
  candidateIdUrlDecoded = decodeURIComponent(candidateIdUrlRaw);
} catch {}

// 2) ID normalizado SOLO para ubicar el candidato en el array
const candidateIdNorm = normId(candidateIdUrlDecoded);


// ===============================
// ✅ Candidate lookup (robusto)
// ===============================
const candidate = useMemo(() => { 
  const all: Array<{
    id: string;
    idNorm: string;
    name: string;
  }> = [];

  for (const g of CANDIDATE_GROUPS) {
    for (const c of g.candidates) {
      const id = String(c.id);
      all.push({
        id,
        idNorm: normId(id),
        name: String(c.name),
      });
    }
  }

  return all.find((x) => x.idNorm === candidateIdNorm) ?? null;
}, [candidateIdNorm]);

// ✅ ID CANÓNICO (el real del dataset). Usar este para Supabase y localStorage.
const candidateId = candidate?.id ?? candidateIdUrlDecoded;

  // ===============================
  // ✅ Unlock with PIN (solo emisor)
  // ===============================
  const [pins, setPins] = useState<CandidatePin[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  // ✅ PIN desde Supabase (entre dispositivos)
  const [serverPin, setServerPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;

    async function loadPin() {
      setPinLoading(true);

      const { data, error } = await supabase
        .from("votoclaro_candidate_pins")
        .select("pin")
        .eq("candidate_id", candidateId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn(
          "[VOTO CLARO] Error leyendo PIN desde Supabase:",
          error.message
        );
        setServerPin(null);
      } else {
        setServerPin((data?.pin as string) ?? null);
      }

      setPinLoading(false);
    }

    void loadPin();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPins(readPins());
    const ok =
      window.localStorage.getItem(LS_PANEL_UNLOCK_PREFIX + candidateId) === "1";
    setUnlocked(ok);
  }, [candidateId]);

  const correctPin = useMemo(() => {
    // 1) Primero Supabase (nube / entre dispositivos)
    if (serverPin) return serverPin;

    // 2) Fallback local (demo antigua)
    return pins.find((p) => p.candidateId === candidateId)?.pin ?? null;
  }, [serverPin, pins, candidateId]);

  function tryUnlock() {
    if (!correctPin) {
      alert("Aún no existe PIN para este candidato. Pídeselo al administrador.");
      return;
    }
    if (pinInput.trim() === correctPin) {
      window.localStorage.setItem(LS_PANEL_UNLOCK_PREFIX + candidateId, "1");
      setUnlocked(true);
    } else {
      alert("PIN incorrecto.");
    }
  }

  // ===============================
  // ✅ Lives management
  // ===============================
  const [lives, setLives] = useState<LiveEntry[]>([]);
  const [platform, setPlatform] = useState<LivePlatform>("FACEBOOK");
  const [url, setUrl] = useState("");
  const [setAsLive, setSetAsLive] = useState(true);

  // ✅ FIX: Supabase es la fuente de verdad para ESTE candidato (no reinsertamos localStorage borrado)
  // ✅ PLUS: Realtime (si admin borra, el panel se actualiza solo)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!candidateId) return;

    let cancelled = false;

    // 1) Carga inmediata local (por si la red demora)
    setLives(readLives());

    function replaceCandidateLivesInState(serverCandidateLives: LiveEntry[]) {
      setLives((prev) => {
        const others = prev.filter((x) => x.candidateId !== candidateId);
        const next = [...serverCandidateLives, ...others].sort(
          (a, b) => b.createdAt - a.createdAt
        );
        writeLives(next);
        return next;
      });
    }

    async function loadCandidateLivesFromSupabase() {
      const { data, error } = await supabase
        .from("votoclaro_live_entries")
        .select("id,candidate_id,candidate_name,platform,url,status,created_at")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(300);

      if (cancelled) return;

      if (error) {
        console.warn(
          "[VOTO CLARO] Error leyendo lives desde Supabase:",
          error.message
        );
        return;
      }

      const serverLivesForCandidate: LiveEntry[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        candidateId: String(r.candidate_id),
        candidateName: String(r.candidate_name),
        platform: r.platform as LivePlatform,
        url: String(r.url),
        status: r.status as "LIVE" | "ENDED",
        createdAt: new Date(r.created_at).getTime(),
      }));

      // ✅ Supabase manda: reemplazamos lo del candidato (NO reinsertamos "localOnly")
      replaceCandidateLivesInState(serverLivesForCandidate);
    }

    void loadCandidateLivesFromSupabase();

    // Listener de storage (misma PC en otra pestaña)
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_LIVE_KEY) {
        // Revalidamos desde Supabase para que no reaparezcan borrados
        void loadCandidateLivesFromSupabase();
      }
      if (e.key === LS_PINS_KEY) setPins(readPins());
    };
    window.addEventListener("storage", onStorage);

    // ✅ Realtime: INSERT / UPDATE / DELETE del candidato
    const channel = supabase
      .channel(`vc-live-${candidateId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votoclaro_live_entries",
          filter: `candidate_id=eq.${candidateId}`,
        },
        (payload: any) => {
            console.log("[ADMIN REALTIME payload]", payload);

          // DELETE
          if (payload.eventType === "DELETE") {
            const deletedId = String(payload.old?.id ?? "");
            if (!deletedId) return;

            setLives((prev) => {
              const next = prev.filter((x) => x.id !== deletedId);
              writeLives(next);
              return next;
            });
            return;
          }

          // INSERT / UPDATE
          const row = payload.new;
          if (!row) return;

          const incoming: LiveEntry = {
            id: String(row.id),
            candidateId: String(row.candidate_id),
            candidateName: String(row.candidate_name),
            platform: row.platform as LivePlatform,
            url: String(row.url),
            status: row.status as "LIVE" | "ENDED",
            createdAt: new Date(row.created_at).getTime(),
          };

          setLives((prev) => {
            const idx = prev.findIndex((x) => x.id === incoming.id);
            let next: LiveEntry[];
            if (idx >= 0) {
              next = prev.map((x) => (x.id === incoming.id ? incoming : x));
            } else {
              next = [incoming, ...prev];
            }
            next = next.sort((a, b) => b.createdAt - a.createdAt);
            writeLives(next);
            return next;
          });
        }
      )
      .subscribe((status) => {
  console.log("[ADMIN REALTIME status]", status);
});


    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      void supabase.removeChannel(channel);
    };
  }, [candidateId]);

  const myHistory = useMemo(() => {
    return lives
      .filter((x) => x.candidateId === candidateId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [lives, candidateId]);

  const myLiveNow = useMemo(() => {
    return myHistory.find((x) => x.status === "LIVE") ?? null;
  }, [myHistory]);

  async function activateLink() {
    if (!candidate) {
      alert("Candidato no encontrado.");
      return;
    }
    const trimmed = url.trim();
    if (!trimmed || !isValidUrl(trimmed)) {
      alert("Pega un enlace válido (https://...).");
      return;
    }

    const now = Date.now();

    // ✅ REGLA A: si activan nuevo LIVE, el anterior LIVE del mismo candidato pasa a ENDED
    let next = lives.map((x) =>
      x.candidateId === candidateId && x.status === "LIVE"
        ? { ...x, status: "ENDED" as const }
        : x
    );

    const entry: LiveEntry = {
      id: genId(),
      candidateId,
      candidateName: candidate.name,
      platform,
      url: trimmed,
      createdAt: now,
      status: setAsLive ? "LIVE" : "ENDED",
    };

    next = [entry, ...next];
    setLives(next);
    writeLives(next);

    // ✅ Guardar también en Supabase (para sincronizar entre dispositivos)
    // ✅ IMPORTANTE: NO enviamos "id" (Supabase genera UUID)
    // ✅ Luego reemplazamos el id temporal por el UUID real en state + localStorage
    try {
      const { data, error } = await supabase
        .from("votoclaro_live_entries")
        .insert({
          // id: NO SE ENVÍA
          candidate_id: candidateId,
          candidate_name: candidate.name,
          platform,
          url: trimmed,
          status: entry.status,
          created_at: new Date(now).toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        console.warn("[Supabase] insert live error:", error.message);
      } else if (data?.id) {
        const serverId = String(data.id);

        setLives((curr) => {
          const updated = curr.map((x) =>
            x.id === entry.id ? { ...x, id: serverId } : x
          );
          writeLives(updated);
          return updated;
        });
      }
    } catch (e: any) {
      console.warn(
        "[Supabase] insert live error (exception):",
        e?.message ?? e
      );
    }

    setUrl("");
    alert(setAsLive ? "Transmisión activada ✅" : "Enlace guardado en historial ✅");
  }

  function finishLive() {
    if (!myLiveNow) return;
    const next = lives.map((x) =>
      x.id === myLiveNow.id ? { ...x, status: "ENDED" as const } : x
    );
    setLives(next);
    writeLives(next);

    // ✅ Actualizar también en Supabase (para sincronizar entre dispositivos)
    void supabase
      .from("votoclaro_live_entries")
      .update({ status: "ENDED" })
      .eq("id", myLiveNow.id)
      .then(({ error }) => {
        if (error) {
          console.warn("[Supabase] update live error:", error.message);
        }
      });

    alert("Transmisión finalizada ✅");
  }
  async function deleteLive(entry: LiveEntry) {
    const ok = confirm("¿Seguro que deseas BORRAR este enlace?\n\nSe eliminará en Usuario y Administrador también.");
    if (!ok) return;

    // 1) UI inmediata (optimista)
    setLives((prev) => {
      const next = prev.filter((x) => x.id !== entry.id);
      writeLives(next);
      return next;
    });

    // 2) Borrar en Supabase (source of truth)
    try {
      const { error } = await supabase
        .from("votoclaro_live_entries")
        .delete()
        .eq("id", entry.id);

      if (error) {
        console.warn("[Supabase] delete live error:", error.message);

        // 🔁 Re-sync: si falló el delete, recargamos desde Supabase para no quedar desincronizados
        const { data, error: reloadErr } = await supabase
          .from("votoclaro_live_entries")
          .select("id,candidate_id,candidate_name,platform,url,status,created_at")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })
          .limit(300);

        if (!reloadErr) {
          const serverLivesForCandidate: LiveEntry[] = (data ?? []).map((r: any) => ({
            id: String(r.id),
            candidateId: String(r.candidate_id),
            candidateName: String(r.candidate_name),
            platform: r.platform as LivePlatform,
            url: String(r.url),
            status: r.status as "LIVE" | "ENDED",
            createdAt: new Date(r.created_at).getTime(),
          }));

          setLives((prev) => {
            const others = prev.filter((x) => x.candidateId !== candidateId);
            const next = [...serverLivesForCandidate, ...others].sort((a, b) => b.createdAt - a.createdAt);
            writeLives(next);
            return next;
          });
        }

        alert("No se pudo borrar en Supabase. Revisé sincronización.");
      }
    } catch (e: any) {
      console.warn("[Supabase] delete live exception:", e?.message ?? e);
      alert("Error inesperado al borrar.");
    }
  }

  // ===============================
  // ✅ Styles (PRO verde/rojo)
  // ===============================
  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm";
  const btnDanger =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-700 bg-red-700 text-white text-sm font-extrabold " +
    "hover:bg-red-800 transition shadow-sm";
  const input =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-3 " +
    "text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600";
  const select =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-3 " +
    "text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600";

  if (!candidate) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Panel de candidato (VOTO CLARO)
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-semibold text-slate-700">
              Candidato no encontrado.
            </div>
          </div>
        </section>

        <button type="button" onClick={goBack} className={btn}>
          ← Volver
        </button>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 break-words">
          Panel privado (VOTO CLARO)
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">
              Acceso con PIN
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Candidato: <span className="font-extrabold">{candidate.name}</span>
            </div>

            <input
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              inputMode="numeric"
              placeholder="PIN de 4 dígitos"
              className={input}
            />
            {pinLoading ? (
              <div className="mt-2 text-xs font-semibold text-slate-600">
                Cargando PIN...
              </div>
            ) : null}

            <button type="button" onClick={tryUnlock} className={btn + " mt-3"}>
              Entrar
            </button>

            <div className="mt-3 text-xs text-slate-600">
              Si no tienes PIN, pídelo al administrador.
            </div>
          </div>
        </section>

        <button type="button" onClick={goBack} className={btn}>
          ← Volver
        </button>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 break-words">
          Panel de transmisión (VOTO CLARO)
        </h1>

        <button type="button" onClick={goBack} className={btn}>
          ← Volver
        </button>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="text-sm font-extrabold text-slate-900">Candidato</div>
          <div className="mt-1 text-base md:text-lg font-extrabold text-slate-900 break-words">
            {candidate.name}
          </div>

          {myLiveNow ? (
            <div className="mt-4 rounded-2xl border-4 border-red-700 bg-red-50/60 p-4">
              <div className="text-xs font-extrabold text-red-800">EN VIVO</div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">
                {platformLabel(myLiveNow.platform)}
              </div>
              <div className="mt-2 text-[12px] text-slate-700 break-words">
                {myLiveNow.url}
              </div>

              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => window.open(myLiveNow.url, "_blank")}
                  className={btn}
                >
                  Ver en vivo
                </button>

                <button type="button" onClick={finishLive} className={btnDanger}>
                  Finalizar EN VIVO
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50/70 p-4 text-sm font-semibold text-slate-700">
              No tienes transmisión EN VIVO activa.
            </div>
          )}

          <div className="mt-5 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
            <div className="text-sm font-extrabold text-slate-900">
              Publicar enlace
            </div>

            <label className="mt-3 block text-sm font-extrabold text-slate-800">
              Plataforma:
            </label>

            <select
              className={select}
              value={platform}
              onChange={(e) => setPlatform(e.target.value as LivePlatform)}
            >
              <option value="FACEBOOK">Facebook</option>
              <option value="YOUTUBE">YouTube</option>
              <option value="TIKTOK">TikTok</option>
              <option value="OTRA">Otra</option>
            </select>

            <label className="mt-3 block text-sm font-extrabold text-slate-800">
              Enlace (https://...)
            </label>

            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Pega aquí el link del live o del video"
              className={input}
            />

            <div className="mt-3 flex items-center gap-2">
              <input
                id="asLive"
                type="checkbox"
                checked={setAsLive}
                onChange={(e) => setSetAsLive(e.target.checked)}
                className="h-4 w-4"
              />
              <label
                htmlFor="asLive"
                className="text-sm font-extrabold text-slate-800"
              >
                Marcar como EN VIVO (si ya está transmitiendo)
              </label>
            </div>

            <button
              type="button"
              onClick={activateLink}
              className={btn + " mt-3"}
            >
              Guardar enlace
            </button>

            <div className="mt-2 text-xs text-slate-600 leading-relaxed">
              Regla automática: si guardas un nuevo EN VIVO, el EN VIVO anterior se
              finaliza solo.
            </div>
          </div>

          <div className="mt-5 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4">
            <div className="text-sm font-extrabold text-slate-900">
              Historial de transmisiones
            </div>

            {myHistory.length === 0 ? (
              <div className="mt-2 text-sm font-semibold text-slate-700">
                Aún no hay enlaces guardados.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {myHistory.map((x) => (
                  <div
                    key={x.id}
                    className="rounded-2xl border-2 border-red-600 bg-white/85 p-3 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-700">
                        {new Date(x.createdAt).toLocaleString("es-PE")} ·{" "}
                        {platformLabel(x.platform)} ·{" "}
                        {x.status === "LIVE" ? "🔴 EN VIVO" : "Finalizado"}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600 break-words">
                        {x.url}
                      </div>
                    </div>

                   <div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => window.open(x.url, "_blank")}
    className={btn}
  >
    Ver
  </button>

  <button
    type="button"
    onClick={() => deleteLive(x)}
    className={btnDanger}
    title="Borrar enlace"
  >
    🗑️ Borrar
  </button>
</div>

                  </div>
                ))}

              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
