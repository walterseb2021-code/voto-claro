// src/app/panel/candidato/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type AccessStatusResponse = {
  accessAvailable?: boolean;
};

const ACCESS_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const INVALID_ACCESS_CODE_MESSAGE =
  "Ingresa un código de acceso válido de 8 caracteres.";

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
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessAvailabilityLoading, setAccessAvailabilityLoading] = useState(true);
  const [accessAvailable, setAccessAvailable] = useState<boolean | null>(null);
  const [accessStatusCandidateId, setAccessStatusCandidateId] = useState<string | null>(null);
  const [accessAvailabilityError, setAccessAvailabilityError] = useState(false);
  const explicitLogoutRef = useRef(false);
  const mountedRef = useRef(false);
  const loadLivesAbortRef = useRef<AbortController | null>(null);
  const loadLivesRequestIdRef = useRef(0);
  const accessStatusAbortRef = useRef<AbortController | null>(null);
  const accessStatusRequestIdRef = useRef(0);
  const currentAccessStatusCandidateIdRef = useRef<string | null>(null);
  const accessFailureAlertTimeoutRef = useRef<number | null>(null);

  const currentAccessStatusCandidateId = candidate?.storageCandidateId ?? null;
  currentAccessStatusCandidateIdRef.current = currentAccessStatusCandidateId;

  const [lives, setLives] = useState<LiveEntry[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [platform, setPlatform] = useState<LivePlatform>("FACEBOOK");
  const [url, setUrl] = useState("");
  const [setAsLive, setSetAsLive] = useState(true);

  function cancelActiveLoadLives() {
    loadLivesRequestIdRef.current += 1;
    loadLivesAbortRef.current?.abort();
    loadLivesAbortRef.current = null;
  }

  function cancelActiveAccessStatus() {
    accessStatusRequestIdRef.current += 1;
    accessStatusAbortRef.current?.abort();
    accessStatusAbortRef.current = null;
  }

  function startLoadLivesRequest() {
    cancelActiveLoadLives();

    if (!mountedRef.current || explicitLogoutRef.current) {
      return null;
    }

    const controller = new AbortController();
    const requestId = loadLivesRequestIdRef.current + 1;
    loadLivesRequestIdRef.current = requestId;
    loadLivesAbortRef.current = controller;

    return { controller, requestId };
  }

  function canApplyLoadLivesRequest(
    requestId: number,
    controller: AbortController
  ) {
    return (
      mountedRef.current &&
      !explicitLogoutRef.current &&
      loadLivesRequestIdRef.current === requestId &&
      loadLivesAbortRef.current === controller &&
      !controller.signal.aborted
    );
  }

  function isAbortError(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    );
  }

  function startAccessStatusRequest() {
    const accessStatusCandidateIdForRequest = currentAccessStatusCandidateId;

    if (
      !mountedRef.current ||
      !candidate ||
      !accessStatusCandidateIdForRequest ||
      currentAccessStatusCandidateIdRef.current !== accessStatusCandidateIdForRequest
    ) {
      return null;
    }

    cancelActiveAccessStatus();

    const controller = new AbortController();
    const requestId = accessStatusRequestIdRef.current + 1;
    accessStatusRequestIdRef.current = requestId;
    accessStatusAbortRef.current = controller;

    return {
      controller,
      requestId,
      candidateIdForRequest: candidateId,
      accessStatusCandidateIdForRequest,
    };
  }

  function canApplyAccessStatusRequest(
    requestId: number,
    controller: AbortController,
    accessStatusCandidateIdForRequest: string
  ) {
    return (
      mountedRef.current &&
      accessStatusRequestIdRef.current === requestId &&
      accessStatusAbortRef.current === controller &&
      currentAccessStatusCandidateIdRef.current === accessStatusCandidateIdForRequest &&
      !controller.signal.aborted
    );
  }

  async function loadAccessAvailability() {
    const request = startAccessStatusRequest();
    if (!request) return;

    const {
      controller,
      requestId,
      candidateIdForRequest,
      accessStatusCandidateIdForRequest,
    } = request;
    setAccessAvailabilityLoading(true);
    setAccessAvailabilityError(false);
    setAccessAvailable(null);
    setAccessStatusCandidateId(null);

    try {
      const res = await fetch(
        `/api/candidate/panel/access-status?candidateId=${encodeURIComponent(candidateIdForRequest)}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        }
      );

      const data = (await res.json().catch(() => null)) as AccessStatusResponse | null;

      if (
        !canApplyAccessStatusRequest(
          requestId,
          controller,
          accessStatusCandidateIdForRequest
        )
      ) {
        return;
      }

      if (!res.ok || typeof data?.accessAvailable !== "boolean") {
        setAccessAvailable(null);
        setAccessStatusCandidateId(accessStatusCandidateIdForRequest);
        setAccessAvailabilityError(true);
        setAccessCodeInput("");
        return;
      }

      setAccessAvailable(data.accessAvailable);
      setAccessStatusCandidateId(accessStatusCandidateIdForRequest);
      setAccessAvailabilityError(false);
      if (!data.accessAvailable) {
        setAccessCodeInput("");
      }
    } catch (error) {
      if (isAbortError(error)) return;
      if (
        canApplyAccessStatusRequest(
          requestId,
          controller,
          accessStatusCandidateIdForRequest
        )
      ) {
        setAccessAvailable(null);
        setAccessStatusCandidateId(accessStatusCandidateIdForRequest);
        setAccessAvailabilityError(true);
        setAccessCodeInput("");
      }
    } finally {
      if (
        canApplyAccessStatusRequest(
          requestId,
          controller,
          accessStatusCandidateIdForRequest
        )
      ) {
        setAccessAvailabilityLoading(false);
      }
      if (accessStatusAbortRef.current === controller) {
        accessStatusAbortRef.current = null;
      }
    }
  }

  function expireSession(message = "La sesión venció. Ingresa nuevamente el código de acceso.") {
    if (!mountedRef.current) return;

    setAuthenticated(false);
    setSessionExpiresAt(null);
    setLives([]);
    if (!explicitLogoutRef.current) {
      setNotice(message);
    }
    void loadAccessAvailability();
  }

  function showAccessFailure(message: string) {
    if (!mountedRef.current) return;

    setAccessCodeInput("");
    if (accessFailureAlertTimeoutRef.current !== null) {
      window.clearTimeout(accessFailureAlertTimeoutRef.current);
    }

    accessFailureAlertTimeoutRef.current = window.setTimeout(() => {
      accessFailureAlertTimeoutRef.current = null;
      if (mountedRef.current) alert(message);
    }, 0);
  }

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cancelActiveLoadLives();
      cancelActiveAccessStatus();
      if (accessFailureAlertTimeoutRef.current !== null) {
        window.clearTimeout(accessFailureAlertTimeoutRef.current);
        accessFailureAlertTimeoutRef.current = null;
      }
    };
  }, []);

  async function loadLives() {
    const request = startLoadLivesRequest();
    if (!request) return;

    const { controller, requestId } = request;
    setLiveLoading(true);

    try {
      const res = await fetch("/api/candidate/live", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!canApplyLoadLivesRequest(requestId, controller)) return;

      if (res.status === 401 || res.status === 403) {
        expireSession();
        return;
      }

      const data = (await res.json().catch(() => null)) as LiveListResponse | null;

      if (!canApplyLoadLivesRequest(requestId, controller)) return;

      if (!res.ok || !data?.ok) {
        setNotice("No se pudo cargar el historial.");
        return;
      }

      setLives(data.entries);
    } catch (error) {
      if (isAbortError(error)) return;
      if (canApplyLoadLivesRequest(requestId, controller)) {
        setNotice("No se pudo cargar el historial.");
      }
    } finally {
      if (canApplyLoadLivesRequest(requestId, controller)) {
        setLiveLoading(false);
      }
      if (loadLivesAbortRef.current === controller) {
        loadLivesAbortRef.current = null;
      }
    }
  }

  useEffect(() => {
    if (!candidate) {
      setSessionLoading(false);
      setAccessAvailabilityLoading(false);
      setAccessAvailable(null);
      setAccessStatusCandidateId(null);
      setAccessAvailabilityError(false);
      cancelActiveAccessStatus();
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
          void loadAccessAvailability();
          await loadLives();
          return;
        }

        setAuthenticated(false);
        setSessionExpiresAt(null);
        setLives([]);
        await loadAccessAvailability();

        if (data?.authenticated && !matchesCandidate) {
          setNotice("Hay una sesión activa para otro candidato. Cierra sesión e ingresa el código correcto.");
        }
      } catch {
        if (cancelled) return;
        setAuthenticated(false);
        setSessionExpiresAt(null);
        setLives([]);
        await loadAccessAvailability();
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
      cancelActiveAccessStatus();
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

    const normalizedAccessCode = accessCodeInput.trim().toUpperCase();
    if (!ACCESS_CODE_PATTERN.test(normalizedAccessCode)) {
      setAccessCodeInput("");
      setNotice(INVALID_ACCESS_CODE_MESSAGE);
      return;
    }

    if (
      unlockLoading ||
      accessAvailabilityLoading ||
      accessAvailabilityError ||
      accessStatusCandidateId !== currentAccessStatusCandidateId ||
      accessAvailable !== true
    ) {
      setAccessCodeInput("");
      return;
    }

    explicitLogoutRef.current = false;
    setUnlockLoading(true);
    setNotice(null);

    try {
      const res = await fetch("/api/candidate/panel/unlock", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, accessCode: normalizedAccessCode }),
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
        showAccessFailure(
          res.status === 429
            ? "Demasiados intentos. Intenta nuevamente más tarde."
            : "No se pudo validar el acceso."
        );
        void loadAccessAvailability();
        return;
      }

      setAuthenticated(true);
      setSessionExpiresAt(data.expiresAt ?? null);
      setAccessCodeInput("");
      await loadLives();
    } catch {
      showAccessFailure("No se pudo validar el acceso.");
      void loadAccessAvailability();
    } finally {
      if (mountedRef.current) {
        setUnlockLoading(false);
      }
    }
  }

  async function logout() {
    explicitLogoutRef.current = true;
    cancelActiveLoadLives();
    cancelActiveAccessStatus();
    try {
      await fetch("/api/candidate/panel/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      if (!mountedRef.current) return;

      setAuthenticated(false);
      setSessionExpiresAt(null);
      setLives([]);
      setAccessCodeInput("");
      setLiveLoading(false);
      setNotice("Sesión cerrada.");
      void loadAccessAvailability();
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
  const accessStatusMatchesCurrentCandidate =
    currentAccessStatusCandidateId !== null &&
    accessStatusCandidateId === currentAccessStatusCandidateId;
  const accessAvailabilityPending =
    currentAccessStatusCandidateId !== null &&
    (accessAvailabilityLoading || !accessStatusMatchesCurrentCandidate);
  const accessAvailabilityErrorForCurrentCandidate =
    !accessAvailabilityPending &&
    accessAvailabilityError &&
    accessStatusMatchesCurrentCandidate;
  const normalizedAccessCode = accessCodeInput.trim().toUpperCase();
  const hasValidAccessCodeFormat = ACCESS_CODE_PATTERN.test(normalizedAccessCode);
  const canEditAccessCode =
    !unlockLoading &&
    !accessAvailabilityPending &&
    !accessAvailabilityErrorForCurrentCandidate &&
    accessStatusMatchesCurrentCandidate &&
    accessAvailable === true;
  const canSubmitAccessCode =
    canEditAccessCode &&
    hasValidAccessCodeFormat;
  const accessUnavailable =
    !accessAvailabilityPending &&
    !accessAvailabilityErrorForCurrentCandidate &&
    accessStatusMatchesCurrentCandidate &&
    accessAvailable === false;

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
              Acceso privado
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Candidato: <span className="font-extrabold">{candidate.displayName}</span>
            </div>

            {notice ? (
              <div className="mt-3 rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                {notice}
              </div>
            ) : null}

            {accessAvailabilityPending ? (
              <div className="mt-3 rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                Verificando disponibilidad del acceso...
              </div>
            ) : null}

            {accessAvailabilityErrorForCurrentCandidate ? (
              <div className="mt-3 rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                No se pudo verificar la disponibilidad del acceso. Recarga la página.
              </div>
            ) : null}

            {accessUnavailable ? (
              <>
                <div className="mt-3 rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                  Acceso deshabilitado
                </div>

                <div className="mt-3 text-xs text-slate-600">
                  El acceso privado de este candidato no se encuentra disponible.
                </div>
              </>
            ) : null}

            <input
              type="password"
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              placeholder="Código de acceso"
              className={input}
              disabled={!canEditAccessCode}
            />

            <button
              type="button"
              onClick={tryUnlock}
              className={btn + " mt-3"}
              disabled={!canSubmitAccessCode}
            >
              {unlockLoading ? "Validando..." : "Entrar"}
            </button>

            {!accessUnavailable ? (
              <div className="mt-3 text-xs text-slate-600">
                Si no tienes un código de acceso, pídeselo al administrador.
              </div>
            ) : null}
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
