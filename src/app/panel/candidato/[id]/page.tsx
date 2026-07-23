// src/app/panel/candidato/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { resolveCandidatePanelIdentity } from "@/lib/candidatePanelCatalog";

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

type SessionResponse =
  | {
      authenticated: true;
      candidateId: string;
      expiresAt?: string;
    }
  | { authenticated: false };

type LiveListResponse =
  | { ok: true; entries: LiveEntry[] }
  | { ok: false; error?: string };

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
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function CandidatePanelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();

  function goBack() {
    const returnTo = searchParams.get("returnTo");
    if (returnTo && returnTo.startsWith("/")) {
      router.push(returnTo);
      return;
    }

    if (typeof window !== "undefined") {
      const ref = document.referrer || "";
      const origin = window.location.origin;

      if (ref.startsWith(origin)) {
        try {
          const u = new URL(ref);
          const path = u.pathname + u.search + u.hash;
          const blocked =
            path === "/" || path.startsWith("/bienvenida") || path.includes("splash");

          if (!blocked) {
            router.push(path);
            return;
          }
        } catch {}
      }

      if (window.history.length > 1) {
        router.back();
        return;
      }
    }

    router.push("/");
  }

  const candidateIdUrlRaw = String(params?.id ?? "");
  let candidateIdUrlDecoded = candidateIdUrlRaw;
  try {
    candidateIdUrlDecoded = decodeURIComponent(candidateIdUrlRaw);
  } catch {}

  const candidate = useMemo(() => {
    return resolveCandidatePanelIdentity(candidateIdUrlDecoded);
  }, [candidateIdUrlDecoded]);

  const candidateId = candidate?.canonicalId ?? candidateIdUrlDecoded;

  const [sessionLoading, setSessionLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [lives, setLives] = useState<LiveEntry[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [platform, setPlatform] = useState<LivePlatform>("FACEBOOK");
  const [url, setUrl] = useState("");
  const [setAsLive, setSetAsLive] = useState(true);

  function expireSession(message = "La sesión venció. Ingresa nuevamente el PIN.") {
    setAuthenticated(false);
    setSessionExpiresAt(null);
    setLives([]);
    setNotice(message);
  }

  async function loadLives() {
    setLiveLoading(true);
    try {
      const res = await fetch("/api/candidate/live", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        expireSession();
        return;
      }

      const data = (await res.json().catch(() => null)) as LiveListResponse | null;
      if (!res.ok || !data?.ok) {
        setNotice("No se pudo cargar el historial.");
        return;
      }

      setLives(data.entries);
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    if (!candidate) {
      setSessionLoading(false);
      return;
    }

    let cancelled = false;

    async function checkSession() {
      setSessionLoading(true);
      setNotice(null);

      try {
        const res = await fetch("/api/candidate/panel/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as SessionResponse | null;

        if (cancelled) return;

        const sessionIdentity = data?.authenticated
          ? resolveCandidatePanelIdentity(data.candidateId)
          : null;
        const matchesCandidate =
          Boolean(sessionIdentity && candidate) &&
          sessionIdentity?.storageCandidateId === candidate?.storageCandidateId;

        if (res.ok && data?.authenticated && matchesCandidate) {
          setAuthenticated(true);
          setSessionExpiresAt(data.expiresAt ?? null);
          await loadLives();
          return;
        }

        setAuthenticated(false);
        setSessionExpiresAt(null);
        setLives([]);

        if (data?.authenticated && !matchesCandidate) {
          setNotice("Hay una sesión activa para otro candidato. Cierra sesión e ingresa el PIN correcto.");
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, candidate]);

  useEffect(() => {
    if (!authenticated) return;
    if (typeof window === "undefined") return;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadLives();
      }
    };

    const intervalId = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, candidateId]);

  const myHistory = useMemo(() => {
    if (!candidate) return [];
    return lives
      .filter(
        (x) =>
          x.candidateId === candidate.canonicalId ||
          x.candidateId === candidate.storageCandidateId
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [lives, candidate]);

  const myLiveNow = useMemo(() => {
    return myHistory.find((x) => x.status === "LIVE") ?? null;
  }, [myHistory]);

  async function tryUnlock() {
    if (!candidate) {
      alert("Candidato no encontrado.");
      return;
    }

    setUnlockLoading(true);
    setNotice(null);

    try {
      const res = await fetch("/api/candidate/panel/unlock", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, pin: pinInput.trim() }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; authenticated?: boolean; candidateId?: string; expiresAt?: string }
        | null;
      const unlockedIdentity = data?.candidateId
        ? resolveCandidatePanelIdentity(data.candidateId)
        : null;
      const unlockedMatchesCandidate =
        Boolean(unlockedIdentity && candidate) &&
        unlockedIdentity?.storageCandidateId === candidate?.storageCandidateId;

      if (!res.ok || !data?.ok || !unlockedMatchesCandidate) {
        alert(
          res.status === 429
            ? "Demasiados intentos. Intenta nuevamente más tarde."
            : "No se pudo validar el acceso."
        );
        return;
      }

      setAuthenticated(true);
      setSessionExpiresAt(data.expiresAt ?? null);
      setPinInput("");
      await loadLives();
    } finally {
      setUnlockLoading(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/candidate/panel/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      setAuthenticated(false);
      setSessionExpiresAt(null);
      setLives([]);
      setPinInput("");
      setNotice("Sesión cerrada.");
    }
  }

  async function activateLink() {
    if (!candidate) {
      alert("Candidato no encontrado.");
      return;
    }

    const trimmed = url.trim();
    if (!trimmed || !isValidUrl(trimmed)) {
      alert("Pega un enlace válido con https://");
      return;
    }

    const res = await fetch("/api/candidate/live", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, url: trimmed, setAsLive }),
    });

    if (res.status === 401 || res.status === 403) {
      expireSession();
      return;
    }

    if (!res.ok) {
      alert("No se pudo guardar el enlace.");
      return;
    }

    setUrl("");
    await loadLives();
    alert(setAsLive ? "Transmisión activada ✅" : "Enlace guardado en historial ✅");
  }

  async function finishLive() {
    if (!myLiveNow) return;

    const res = await fetch(`/api/candidate/live/${encodeURIComponent(myLiveNow.id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ENDED" }),
    });

    if (res.status === 401 || res.status === 403) {
      expireSession();
      return;
    }

    if (!res.ok) {
      alert("No se pudo finalizar la transmisión.");
      return;
    }

    await loadLives();
    alert("Transmisión finalizada ✅");
  }

  async function deleteLive(entry: LiveEntry) {
    const ok = confirm(
      "¿Seguro que deseas BORRAR este enlace?\n\nSe eliminará en Usuario y Administrador también."
    );
    if (!ok) return;

    const res = await fetch(`/api/candidate/live/${encodeURIComponent(entry.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });

    if (res.status === 401 || res.status === 403) {
      expireSession();
      return;
    }

    if (!res.ok) {
      alert("No se pudo borrar el enlace.");
      return;
    }

    await loadLives();
  }

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const btnDanger =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-700 bg-red-700 text-white text-sm font-extrabold " +
    "hover:bg-red-800 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
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

  if (sessionLoading) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 break-words">
          Panel privado (VOTO CLARO)
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">
              Verificando sesión...
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!authenticated) {
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
              Candidato: <span className="font-extrabold">{candidate.displayName}</span>
            </div>

            {notice ? (
              <div className="mt-3 rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                {notice}
              </div>
            ) : null}

            <input
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              inputMode="numeric"
              placeholder="PIN de 4 dígitos"
              className={input}
              disabled={unlockLoading}
            />

            <button
              type="button"
              onClick={tryUnlock}
              className={btn + " mt-3"}
              disabled={unlockLoading}
            >
              {unlockLoading ? "Validando..." : "Entrar"}
            </button>

            <div className="mt-3 text-xs text-slate-600">
              Si no tienes PIN, pídeselo al administrador.
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

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={goBack} className={btn}>
            ← Volver
          </button>
          <button type="button" onClick={logout} className={btnDanger}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="text-sm font-extrabold text-slate-900">Candidato</div>
          <div className="mt-1 text-base md:text-lg font-extrabold text-slate-900 break-words">
            {candidate.displayName}
          </div>

          {sessionExpiresAt ? (
            <div className="mt-2 text-xs font-semibold text-slate-600">
              Sesión activa hasta: {new Date(sessionExpiresAt).toLocaleString("es-PE")}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-3 rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
              {notice}
            </div>
          ) : null}

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
              {liveLoading ? "Cargando transmisiones..." : "No tienes transmisión EN VIVO activa."}
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
              <label htmlFor="asLive" className="text-sm font-extrabold text-slate-800">
                Marcar como EN VIVO (si ya está transmitiendo)
              </label>
            </div>

            <button type="button" onClick={activateLink} className={btn + " mt-3"}>
              Guardar enlace
            </button>

            <div className="mt-2 text-xs text-slate-600 leading-relaxed">
              Regla automática: si guardas un nuevo EN VIVO, el EN VIVO anterior se
              finaliza solo.
            </div>
          </div>

          <div className="mt-5 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-extrabold text-slate-900">
                Historial de transmisiones
              </div>
              <button type="button" onClick={loadLives} className={btn} disabled={liveLoading}>
                {liveLoading ? "Actualizando..." : "Actualizar"}
              </button>
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
                        {new Date(x.createdAt).toLocaleString("es-PE")} {" - "}
                        {platformLabel(x.platform)} {" - "}
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
