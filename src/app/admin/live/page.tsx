// src/app/admin/live/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminNavActions from "@/components/admin/AdminNavActions";
import AdminButton from "@/components/admin/AdminButton";
import AdminCard from "@/components/admin/AdminCard";
import { useRouter } from "next/navigation";
import {
  getCandidatePanelOptions,
  type CandidatePanelIdentity,
} from "@/lib/candidatePanelCatalog";
import { createClient } from "@supabase/supabase-js";

// ===============================
// ✅ Storage keys (demo PRO)
// ===============================
type LivePlatform = "YOUTUBE" | "FACEBOOK" | "TIKTOK" | "OTRA";

type LiveEntry = {
  id: string;
  candidateId: string;
  candidateName: string;
  platform: LivePlatform;
  url: string;
  createdAt: number;
  status: "LIVE" | "ENDED";
};

type CredentialStatus = "ACTIVE" | "DISABLED" | "REVOKED";

type CredentialState = {
  candidateId: string;
  credentialStatus: CredentialStatus;
  credentialRevision: number;
  hasAccessCode: boolean;
};

const LS_LIVE_KEY = "votoclaro_live_entries_v1";
const LEGACY_PINS_KEY = "votoclaro_live_pins_v1";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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

function normalizeCandidateSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function candidateNameMatchesSearch(candidateName: string, query: string) {
  const tokens = normalizeCandidateSearchText(query).split(" ").filter(Boolean);
  if (!tokens.length) return false;

  const normalizedName = normalizeCandidateSearchText(candidateName);
  return tokens.every((token) => normalizedName.includes(token));
}

export default function AdminLivePage() {
  const router = useRouter();
  const PROD_ORIGIN = "https://voto-claro.vercel.app";

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  const [checking, setChecking] = useState(true);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  useEffect(() => {
    setChecking(false);
  }, []);

  // ===============================
  // ✅ Data candidates (DEDUP por id)
  // ===============================
  const candidatesFlat = useMemo(() => {
    return getCandidatePanelOptions().map((identity) => ({
      ...identity,
      id: identity.canonicalId,
      name: identity.displayName,
    }));
  }, []);

  const [q, setQ] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [generatedAccessCode, setGeneratedAccessCode] = useState<{
    candidateId: string;
    accessCode: string;
  } | null>(null);
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [credentialState, setCredentialState] = useState<CredentialState | null>(
    null
  );
  const [credentialStateLoading, setCredentialStateLoading] = useState(false);
  const [credentialStateQueryFailed, setCredentialStateQueryFailed] =
    useState(false);

  const suggestions = useMemo(() => {
    if (!q.trim()) return [];
    return candidatesFlat
      .filter((x) => candidateNameMatchesSearch(x.name, q))
      .slice(0, 10);
  }, [q, candidatesFlat]);

  // ===============================
  // ✅ Load lives
  // ===============================
  const [lives, setLives] = useState<LiveEntry[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.removeItem(LEGACY_PINS_KEY);

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
      if (e.key === LS_LIVE_KEY) {
        // Preferimos Supabase como fuente de verdad
        void loadLivesFromSupabase();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    setGeneratedAccessCode(null);
  }, [selectedCandidateId]);

  useEffect(() => {
    const selectedCandidate =
      candidatesFlat.find((x) => x.id === selectedCandidateId) ?? null;

    setCredentialState(null);
    setCredentialStateQueryFailed(false);
    setGeneratedAccessCode(null);

    if (!selectedCandidate) {
      setCredentialStateLoading(false);
      return;
    }

    const selectedCanonicalId = selectedCandidate.canonicalId;
    let cancelled = false;
    setCredentialStateLoading(true);

    async function loadCredentialState() {
      try {
        const res = await fetch(
          `/api/admin/candidate-access-code?candidateId=${encodeURIComponent(
            selectedCanonicalId
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              candidateId?: string;
              credentialStatus?: CredentialStatus;
              credentialRevision?: number;
              hasAccessCode?: boolean;
            }
          | null;

        if (cancelled) return;

        const nextStatus = data?.credentialStatus;
        const nextRevision = data?.credentialRevision;

        if (
          !res.ok ||
          !data?.ok ||
          data.candidateId !== selectedCanonicalId ||
          (
            nextStatus !== "ACTIVE" &&
            nextStatus !== "DISABLED" &&
            nextStatus !== "REVOKED"
          ) ||
          typeof nextRevision !== "number" ||
          !Number.isSafeInteger(nextRevision)
        ) {
          setCredentialState(null);
          setCredentialStateQueryFailed(true);
          return;
        }

        setCredentialStateQueryFailed(false);
        setCredentialState({
          candidateId: selectedCanonicalId,
          credentialStatus: nextStatus,
          credentialRevision: nextRevision,
          hasAccessCode: Boolean(data.hasAccessCode),
        });
      } catch {
        if (!cancelled) {
          setCredentialState(null);
          setCredentialStateQueryFailed(true);
        }
      } finally {
        if (!cancelled) setCredentialStateLoading(false);
      }
    }

    void loadCredentialState();

    return () => {
      cancelled = true;
    };
  }, [selectedCandidateId, candidatesFlat]);

  // ===============================
  // ✅ NUEVO: Realtime en Admin (solo candidato seleccionado)
  // ===============================
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Si aún no hay candidato seleccionado, no hacemos subscribe
    const selectedCandidate = candidatesFlat.find((x) => x.id === selectedCandidateId) ?? null;
    if (!selectedCandidate) {
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
      .channel(`vc-admin-live-${selectedCandidate.storageCandidateId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votoclaro_live_entries",
          filter: `candidate_id=eq.${selectedCandidate.storageCandidateId}`,
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
  }, [selectedCandidateId, candidatesFlat]);

  const selectedCandidate = useMemo(() => {
    if (!selectedCandidateId) return null;
    return candidatesFlat.find((x) => x.id === selectedCandidateId) ?? null;
  }, [selectedCandidateId, candidatesFlat]);

  const selectedHistory = useMemo(() => {
    if (!selectedCandidate) return [];
    return lives
      .filter((x) => x.candidateId === selectedCandidate.storageCandidateId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [lives, selectedCandidate]);

  const credentialUnavailable =
    credentialState?.credentialStatus === "DISABLED" ||
    credentialState?.credentialStatus === "REVOKED";

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => alert("Copiado ✅"),
      () => alert("No se pudo copiar. Copia manualmente.")
    );
  }

  async function rotateAccessCode(candidate: CandidatePanelIdentity) {
    if (accessCodeLoading) return;
    const canRotateCredential =
      credentialState?.candidateId === candidate.canonicalId &&
      credentialState.credentialStatus === "ACTIVE";

    if (!canRotateCredential) {
      return;
    }

    const ok = window.confirm(
      "¿Generar o rotar el código de acceso de este candidato?\n\n" +
        "El código actual dejará de funcionar.\n" +
        "Se cerrarán las sesiones activas.\n" +
        "El nuevo código solo se mostrará una vez."
    );
    if (!ok) return;

    setGeneratedAccessCode(null);
    setAccessCodeLoading(true);
    try {
      const res = await fetch("/api/admin/candidate-access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ candidateId: candidate.canonicalId }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; candidateId?: string; accessCode?: string; error?: string }
        | null;

      if (res.status === 409) {
        alert("Otro cambio ocurrió al mismo tiempo. Intenta nuevamente.");
        return;
      }

      if (!res.ok || !data?.ok || data.candidateId !== candidate.canonicalId || !data.accessCode) {
        alert("No se pudo generar el código de acceso.");
        return;
      }

      setGeneratedAccessCode({
        candidateId: candidate.canonicalId,
        accessCode: data.accessCode,
      });
      setCredentialState((prev) =>
        prev?.candidateId === candidate.canonicalId
          ? { ...prev, credentialStatus: "ACTIVE", hasAccessCode: true }
          : prev
      );
    } catch (err) {
      console.warn("[VOTO CLARO] Error de red generando código de acceso:", err);
      alert("Error de red generando el código de acceso.");
    } finally {
      setAccessCodeLoading(false);
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
      const res = await fetch("/api/admin/live", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_one",
          liveId: entry.id,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; deletedId?: string; error?: string }
        | null;

      if (!res.ok || !data?.ok || data.deletedId !== entry.id) {
        alert("No se pudo eliminar. Revisa consola.");
        console.warn(
          "[VOTO CLARO] Error eliminando live (single):",
          data?.error ?? res.status
        );
        return;
      }

      setLives((prev) => prev.filter((x) => x.id !== entry.id));
    } catch (err) {
      alert("Error de red eliminando. Revisa consola.");
      console.warn("[VOTO CLARO] Error de red eliminando live (single):", err);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteAllLivesForCandidate(
    candidateId: string,
    candidateName: string
  ) {
    const ok = window.confirm(
      `¿ELIMINAR TODO el historial de este candidato?\n\n${candidateName}\n\nEsto borra TODOS sus registros en Supabase (global).`
    );
    if (!ok) return;

    setDeletingAll(true);
    try {
      const res = await fetch("/api/admin/live", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_all",
          candidateId,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            candidateId?: string;
            deletedCount?: number;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.ok || data.candidateId !== candidateId) {
        alert("No se pudo eliminar todo. Revisa consola.");
        console.warn(
          "[VOTO CLARO] Error eliminando live (all):",
          data?.error ?? res.status
        );
        return;
      }

      setLives((prev) => prev.filter((x) => x.candidateId !== candidateId));
    } catch (err) {
      alert("Error de red eliminando todo. Revisa consola.");
      console.warn("[VOTO CLARO] Error de red eliminando todo:", err);
    } finally {
      setDeletingAll(false);
    }
  }

  // ===============================
  // UI styles (coherente verde/rojo)
  // ===============================

  // ✅ NUEVO: botón peligro (solo visual; no toca estilos globales)

  const input =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 " +
    "text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600";

  if (checking) {
    return (
      <AdminPageShell>
        <AdminHeader title="Admin – EN VIVO (VOTO CLARO)" />

        <section>
          <AdminCard>
            <div className="text-xl font-extrabold text-black">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Verificando sesión.
            </div>
          </AdminCard>
        </section>

        <AdminButton type="button" onClick={goBack}  className="mt-4">
          ← Volver
        </AdminButton>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminHeader title="Admin – EN VIVO (VOTO CLARO)" actions={
          <AdminNavActions includeLogout>
            <AdminButton href="/admin">Admin Central</AdminButton>
            <AdminButton href="/">Inicio</AdminButton>
            <AdminButton type="button" onClick={goBack}>← Volver</AdminButton>
          </AdminNavActions>
        } />

      <section>
        <AdminCard>
          <div className="text-xl font-extrabold text-black">Buscar candidato</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Escribe nombre: Massé, Acuña, Chiabra..."
            className={input}
          />

          {suggestions.length > 0 ? (
            <div className="mt-2 rounded-2xl border border-slate-300 bg-[#bffcff] p-2">
              {suggestions.map((c, idx) => (
                <AdminButton
                  key={`${c.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedCandidateId(c.id);
                    setQ(c.name);
                  }}
                   className="w-full text-left"
                >
                  {c.name}
                </AdminButton>
              ))}
            </div>
          ) : null}

          {!selectedCandidate ? (
            <div className="mt-4 text-sm font-semibold text-slate-700">
              Selecciona un candidato para gestionar su acceso privado y abrir su panel.
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-slate-300 bg-[#bffcff] p-4">
              <div className="text-xl font-extrabold text-black">
                Candidato seleccionado
              </div>

              <div className="mt-1 text-base md:text-xl font-extrabold text-black break-words">
                {selectedCandidate.name}
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-300 bg-white p-3">
                  <div className="text-sm font-extrabold text-slate-700">
                    Panel del candidato (privado)
                  </div>

                  <div className="mt-1 text-sm text-slate-700 break-words">
                    /panel/candidato/{selectedCandidate.id}
                  </div>

                  <div className="mt-2 flex gap-2 flex-wrap">
                    <AdminButton
                      href={`${PROD_ORIGIN}/panel/candidato/${selectedCandidate.id}`}

                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir panel
                    </AdminButton>

                    <AdminButton
                      type="button"
                      onClick={() =>
                        copy(`${PROD_ORIGIN}/panel/candidato/${selectedCandidate.id}`)
                      }

                    >
                      Copiar link
                    </AdminButton>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-300 bg-white p-3">
                  <div className="text-sm font-extrabold text-slate-700">
                    Código de acceso
                  </div>

                  <div className="mt-2 text-sm font-extrabold text-slate-700">
                    {credentialStateLoading
                      ? "Verificando acceso..."
                      : credentialStateQueryFailed
                        ? "No se pudo consultar el estado del acceso."
                        : credentialState?.credentialStatus === "ACTIVE"
                        ? "Acceso activo"
                        : "Acceso deshabilitado"}
                  </div>

                  {!credentialStateLoading &&
                  !credentialStateQueryFailed &&
                  credentialState?.credentialStatus !== "ACTIVE" ? (
                    <div className="mt-2 text-sm text-slate-600">
                      El acceso privado de este candidato está deshabilitado.
                    </div>
                  ) : null}

                  <div className="mt-2 flex gap-2 flex-wrap">
                    <AdminButton
                      type="button"
                      variant="primary"
                      onClick={() => rotateAccessCode(selectedCandidate)}

                      disabled={
                        accessCodeLoading ||
                        credentialStateLoading ||
                        credentialStateQueryFailed ||
                        credentialState?.credentialStatus !== "ACTIVE"
                      }
                    >
                      {credentialUnavailable
                        ? "Acceso deshabilitado"
                        : accessCodeLoading
                          ? "Generando..."
                          : "Generar código de acceso"}
                    </AdminButton>
                  </div>

                  {generatedAccessCode?.candidateId === selectedCandidate.canonicalId ? (
                    <div className="mt-3 rounded-2xl border border-slate-300 bg-[#bffcff] p-3">
                      <div className="text-sm font-extrabold text-slate-700">
                        Código de acceso generado
                      </div>

                      <div className="mt-1 text-2xl font-extrabold text-slate-900 tracking-widest">
                        {generatedAccessCode.accessCode}
                      </div>

                      <div className="mt-2 flex gap-2 flex-wrap">
                        <AdminButton
                          type="button"
                          onClick={() => copy(generatedAccessCode.accessCode)}

                        >
                          Copiar
                        </AdminButton>

                        <AdminButton
                          type="button"
                          onClick={() => setGeneratedAccessCode(null)}

                        >
                          Ocultar
                        </AdminButton>
                      </div>

                      <div className="mt-2 text-sm text-slate-600">
                        Guárdalo y entrégalo al candidato por un canal seguro. No
                        podrá recuperarse después.
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2 text-sm text-slate-600">
                    El código solo aparece una vez al generarlo o rotarlo.
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-300 bg-white p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-extrabold text-slate-700">
                    Historial del candidato (admin)
                  </div>

                  {/* ✅ NUEVO: Eliminar todo (solo si hay historial) */}
                  {selectedHistory.length > 0 ? (
                    <AdminButton
                      type="button"
                      variant="danger"
                      disabled={deletingAll}
                      onClick={() =>
                        deleteAllLivesForCandidate(
                          selectedCandidate.storageCandidateId,
                          selectedCandidate.name
                        )
                      }
                      title="Elimina todo el historial del candidato (global en Supabase)"
                    >
                      {deletingAll ? "Eliminando..." : "🗑️ Eliminar TODO"}
                    </AdminButton>
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
                        className="rounded-2xl border border-slate-300 bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="text-sm font-extrabold text-slate-800">
                            {new Date(x.createdAt).toLocaleString("es-PE")} ·{" "}
                            {platformLabel(x.platform)} ·{" "}
                            {x.status === "LIVE" ? "🔴 EN VIVO" : "Finalizado"}
                          </div>

                          {/* ✅ NUEVO: Eliminar individual */}
                          <AdminButton
                            type="button"
                            variant="danger"
                            disabled={deletingAll || deletingId === x.id}
                            onClick={() => deleteSingleLive(x)}
                            title="Eliminar este registro (global en Supabase)"
                          >
                            {deletingId === x.id ? "Eliminando..." : "🗑️ Eliminar"}
                          </AdminButton>
                        </div>

                        <div className="mt-1 text-sm text-slate-600 break-words">
                          {x.url}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </AdminCard>
      </section>
    </AdminPageShell>
  );
}
