// src/app/pitch/page.tsx
"use client";

export const dynamic = "force-dynamic";

import React from "react";
import { PITCH_DONE_KEY } from "@/lib/adminConfig";
import { partyWelcomeAssets, setActiveParty } from "@/lib/partyThemeClient";

type AccessState = "CHECKING" | "GRANTED" | "DENIED" | "MISSING_TOKEN";

const BG_GREEN = "rgb(83,129,39)";
const BG_JASPE_SOFT_GREEN =
  "radial-gradient(1200px 800px at 20% 10%, rgba(255,255,140,.07), transparent 45%)," +
  "radial-gradient(900px 700px at 80% 20%, rgba(255,245,120,.06), transparent 50%)," +
  "radial-gradient(1000px 900px at 50% 90%, rgba(255,235,110,.05), transparent 55%)";

const BG_APP = "#0537A8";

const BG_JASPE_SOFT_APP =
  "radial-gradient(1200px 800px at 20% 10%, rgba(190,220,255,.10), transparent 45%)," +
  "radial-gradient(900px 700px at 80% 20%, rgba(160,205,255,.08), transparent 50%)," +
  "radial-gradient(1000px 900px at 50% 90%, rgba(210,235,255,.08), transparent 55%)";

const PANEL_BG = "rgba(255,255,255,.78)";
const TEXT_DARK = "#0f172a";
const TITLE_BLACK = "#0b0b0b";
const RED_BORDER = "#b91c1c";
const BTN_BG = "#14532d";
const BTN_BG_2 = "#166534";
const BTN_BG_APP = BG_APP;
const BTN_BG_APP_2 = "#0D3B9A";
const BTN_TEXT = "#ffffff";
const MAX_PITCH_TOKEN_LENGTH = 2048;
const LEGACY_PITCH_TOKEN_KEY = "votoclaro_pitch_token_v1";
const WELCOME_RETURN_URL_KEY = "vc_welcome_return_url";
const SENSITIVE_URL_PARAMS = new Set([
  "t",
  "token",
  "access_token",
  "refresh_token",
  "code",
  "password",
  "secret",
  "authorization",
]);

function hasSensitiveHash(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return false;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {}

  const candidates = [raw, decoded];
  return candidates.some((value) => {
    const trimmed = value.trim();
    if (!trimmed) return false;

    try {
      const params = new URLSearchParams(
        trimmed.startsWith("?") || trimmed.startsWith("&")
          ? trimmed.slice(1)
          : trimmed
      );
      for (const key of params.keys()) {
        if (SENSITIVE_URL_PARAMS.has(key.toLowerCase())) return true;
      }
    } catch {}

    return /(?:^|[/?&#;\s])(?:t|token|access_token|refresh_token|code|password|secret|authorization)\s*=/i.test(
      trimmed
    );
  });
}

function sanitizeInternalReturnPath(value: string, origin: string) {
  try {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\")) {
      return "/pitch";
    }

    const parsed = new URL(trimmed, origin);
    if (parsed.origin !== origin) return "/pitch";
    if (!["http:", "https:"].includes(parsed.protocol)) return "/pitch";
    if (parsed.username || parsed.password) return "/pitch";
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return "/pitch";
    }

    const params = new URLSearchParams(parsed.search);
    Array.from(params.keys()).forEach((key) => {
      if (SENSITIVE_URL_PARAMS.has(key.toLowerCase())) {
        params.delete(key);
      }
    });

    const hash = hasSensitiveHash(parsed.hash) ? "" : parsed.hash;
    const query = params.toString();

    return `${parsed.pathname}${query ? `?${query}` : ""}${hash}`;
  } catch {
    return "/pitch";
  }
}

function cleanupLegacyPitchStorage() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(LEGACY_PITCH_TOKEN_KEY);
  } catch {}

  try {
    const safeReturnPath = sanitizeInternalReturnPath(
      window.localStorage.getItem(WELCOME_RETURN_URL_KEY) ?? "/pitch",
      window.location.origin
    );
    window.localStorage.setItem(WELCOME_RETURN_URL_KEY, safeReturnPath);
    document.cookie =
      `${WELCOME_RETURN_URL_KEY}=` +
      encodeURIComponent(safeReturnPath) +
      "; path=/; max-age=31536000; SameSite=Lax";
  } catch {}
}

function getTransientTokenAndCleanUrl() {
  const currentUrl = new URL(window.location.href);
  const rawToken = currentUrl.searchParams.get("t");
  const token =
    typeof rawToken === "string" ? rawToken.trim() : "";
  const safeReturnPath = sanitizeInternalReturnPath(currentUrl.href, currentUrl.origin);

  window.history.replaceState(null, "", safeReturnPath || "/pitch");

  return { token, safeReturnPath };
}

function isValidTransientPitchToken(token: string | null | undefined) {
  return Boolean(
    typeof token === "string" &&
      token.trim() &&
      token.length <= MAX_PITCH_TOKEN_LENGTH
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

function saveLegalAcceptance() {
  if (typeof window === "undefined") return;

  document.cookie =
    "vc_legal_accepted=true; path=/; max-age=31536000; SameSite=Lax";
  window.localStorage.setItem("vc_legal_accepted", "true");
}

function savePartyContext(party: "perufederal" | "app") {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem("votoclaro_active_party_v1", party);
    window.sessionStorage.setItem("active_party", party);
    window.sessionStorage.setItem("party", party);
    window.sessionStorage.setItem("votoclaro_party", party);

    window.localStorage.setItem("votoclaro_active_party_v1", party);
    window.localStorage.setItem("active_party", party);
    window.localStorage.setItem("party", party);
    window.localStorage.setItem("votoclaro_party", party);

    document.cookie =
      "votoclaro_party=" +
      encodeURIComponent(party) +
      "; path=/; max-age=31536000; SameSite=Lax";
  } catch {}
}

export default function PitchPage() {
  const [access, setAccess] = React.useState<AccessState>("CHECKING");
  const [party, setParty] = React.useState<"perufederal" | "app">(
    "perufederal"
  );

  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstallable, setIsInstallable] = React.useState(false);
  const [legalAccepted, setLegalAccepted] = React.useState(false);
  const [legalError, setLegalError] = React.useState("");
  const transientPitchTokenRef = React.useRef<string | null | undefined>(undefined);
  const pitchRequestIdRef = React.useRef(0);

  async function installApp() {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        setIsInstallable(false);
        if (outcome === "accepted") return;
      } catch {}
    }

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) {
      alert("La app ya está instalada en tu dispositivo.");
      return;
    }

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);

    let message = "";

    if (isIOS) {
      message =
        "📱 Para instalar en iPhone/iPad:\n\n" +
        '1. Toca el icono "Compartir" (cuadrado con flecha hacia arriba)\n' +
        "2. Desplázate hacia abajo\n" +
        '3. Toca "Agregar a pantalla de inicio"\n' +
        '4. Confirma tocando "Agregar"';
    } else if (isAndroid) {
      message =
        "📱 Para instalar en Android:\n\n" +
        "1. Toca los 3 puntos (menú) en la esquina superior derecha\n" +
        '2. Busca y toca "Instalar aplicación"\n' +
        "3. Confirma la instalación";
    } else {
      message =
        "💻 Para instalar en computadora:\n\n" +
        "Busca el icono de instalación (+) en la barra de direcciones";
    }

    alert(message);
  }

  async function installAppWithLegal() {
    if (!legalAccepted) {
      setLegalError(
        "Para instalar o continuar, primero debes aceptar los documentos legales."
      );
      return;
    }

    saveLegalAcceptance();
    await installApp();
  }

  React.useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const requestId = pitchRequestIdRef.current + 1;
    pitchRequestIdRef.current = requestId;
    let timeoutId: number | null = null;

    function canApplyResult() {
      return (
        alive &&
        pitchRequestIdRef.current === requestId &&
        !controller.signal.aborted
      );
    }

    async function checkAccess() {
      try {
        if (typeof window === "undefined") return;

        cleanupLegacyPitchStorage();
        let token = transientPitchTokenRef.current;
        let safeReturnPath = sanitizeInternalReturnPath(
          window.location.href,
          window.location.origin
        );

        if (token === undefined) {
          const captured = getTransientTokenAndCleanUrl();
          token =
            captured.token && captured.token.length <= MAX_PITCH_TOKEN_LENGTH
              ? captured.token
              : null;
          transientPitchTokenRef.current = token;
          safeReturnPath = captured.safeReturnPath;
        }

        localStorage.setItem(WELCOME_RETURN_URL_KEY, safeReturnPath);
        document.cookie =
          `${WELCOME_RETURN_URL_KEY}=` +
          encodeURIComponent(safeReturnPath) +
          "; path=/; max-age=31536000; SameSite=Lax";

        const nextParty =
          typeof token === "string" &&
          (token.startsWith("GRUPOB-") || token.startsWith("GRUPOC-"))
            ? "app"
            : "perufederal";

        setParty(nextParty);
        setActiveParty(nextParty);

        if (!isValidTransientPitchToken(token)) {
          if (canApplyResult()) setAccess("MISSING_TOKEN");
          transientPitchTokenRef.current = undefined;
          return;
        }

        timeoutId = window.setTimeout(async () => {
          try {
            if (!canApplyResult() || !isValidTransientPitchToken(token)) return;

        const res = await fetch("/api/gate/pitch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token }),
              signal: controller.signal,
        });

            if (!canApplyResult()) return;

        if (!res.ok) {
              setAccess("DENIED");
              transientPitchTokenRef.current = undefined;
          return;
        }

        sessionStorage.setItem("votoclaro_pitch_done_v1", "1");
        sessionStorage.setItem(PITCH_DONE_KEY, "1");

            setAccess("GRANTED");
            transientPitchTokenRef.current = undefined;
          } catch (error) {
            if (isAbortError(error)) return;
            if (canApplyResult()) {
              setAccess("DENIED");
              transientPitchTokenRef.current = undefined;
            }
          }
        }, 0);
      } catch {
        if (canApplyResult()) {
          setAccess("DENIED");
          transientPitchTokenRef.current = undefined;
        }
      }
    }

    checkAccess();

    return () => {
      alive = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      controller.abort();
    };
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();

      if (isMounted) {
        setDeferredPrompt(e);
        setIsInstallable(true);
      }
    };

    const checkIfInstalled = () => {
      if (window.matchMedia("(display-mode: standalone)").matches) {
        if (isMounted) setIsInstallable(false);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    checkIfInstalled();

    const timeoutId = setTimeout(() => {
      if (isMounted && !deferredPrompt) {
        window.dispatchEvent(new Event("beforeinstallprompt"));
      }
    }, 2000);

    return () => {
      isMounted = false;
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      clearTimeout(timeoutId);
    };
  }, [deferredPrompt]);

  if (access === "CHECKING") {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{
          background: party === "app" ? BG_APP : BG_GREEN,
          color: TEXT_DARK,
        }}
      >
        <div
          className="max-w-md w-full text-center rounded-2xl"
          style={{
            background: PANEL_BG,
            border: `3px solid ${RED_BORDER}`,
            padding: 18,
            boxShadow: "0 18px 50px rgba(0,0,0,.25)",
          }}
        >
          <div
            className="text-xl font-extrabold"
            style={{
              color: TITLE_BLACK,
              WebkitTextStroke: `1px ${RED_BORDER}`,
              textShadow: "0 4px 12px rgba(0,0,0,.15)",
            }}
          >
            VOTO_CLARO
          </div>

          <div
            className="mt-2 text-sm"
            style={{ color: TEXT_DARK, fontWeight: 700 }}
          >
            Validando acceso…
          </div>
        </div>
      </main>
    );
  }

  if (access === "MISSING_TOKEN") {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{
          background: party === "app" ? BG_APP : BG_GREEN,
          color: TEXT_DARK,
        }}
      >
        <div
          className="max-w-md w-full text-center rounded-2xl"
          style={{
            background: PANEL_BG,
            border: `3px solid ${RED_BORDER}`,
            padding: 18,
            boxShadow: "0 18px 50px rgba(0,0,0,.25)",
          }}
        >
          <div
            className="text-xl font-extrabold"
            style={{
              color: TITLE_BLACK,
              WebkitTextStroke: `1px ${RED_BORDER}`,
              textShadow: "0 4px 12px rgba(0,0,0,.15)",
            }}
          >
            Acceso bloqueado
          </div>

          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: TEXT_DARK, fontWeight: 700 }}
          >
            Debes volver a abrir el enlace de acceso proporcionado.
          </p>
        </div>
      </main>
    );
  }

  if (access === "DENIED") {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{
          background: party === "app" ? BG_APP : BG_GREEN,
          color: TEXT_DARK,
        }}
      >
        <div
          className="max-w-md w-full text-center rounded-2xl"
          style={{
            background: PANEL_BG,
            border: `3px solid ${RED_BORDER}`,
            padding: 18,
            boxShadow: "0 18px 50px rgba(0,0,0,.25)",
          }}
        >
          <div
            className="text-xl font-extrabold"
            style={{
              color: TITLE_BLACK,
              WebkitTextStroke: `1px ${RED_BORDER}`,
              textShadow: "0 4px 12px rgba(0,0,0,.15)",
            }}
          >
            Acceso no autorizado
          </div>

          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: TEXT_DARK, fontWeight: 700 }}
          >
            Este enlace de prueba fue desactivado o no es válido.
            <br />
            Solicita un nuevo enlace al administrador.
          </p>

          <a
            href="/"
            className="inline-flex mt-5 items-center justify-center rounded-xl px-4 py-2 text-sm"
            style={{
              background: BTN_BG,
              color: BTN_TEXT,
              fontWeight: 900,
              border: `2px solid ${RED_BORDER}`,
              boxShadow: "0 10px 25px rgba(0,0,0,.20)",
            }}
          >
            Ir al inicio
          </a>
        </div>
      </main>
    );
  }

  return (
    <FederalitoSplash
      partyId={party}
      isInstallable={isInstallable}
      installApp={installAppWithLegal}
      legalAccepted={legalAccepted}
      setLegalAccepted={setLegalAccepted}
      legalError={legalError}
      setLegalError={setLegalError}
    />
  );
}

function FederalitoSplash(props: {
  partyId: "perufederal" | "app";
  isInstallable: boolean;
  installApp: () => Promise<void>;
  legalAccepted: boolean;
  setLegalAccepted: React.Dispatch<React.SetStateAction<boolean>>;
  legalError: string;
  setLegalError: React.Dispatch<React.SetStateAction<string>>;
}) {
  const isApp = props.partyId === "app";
  const assets = partyWelcomeAssets(props.partyId);
  const posterRef = React.useRef<HTMLImageElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const flashRef = React.useRef<HTMLDivElement | null>(null);

  function resetVisual() {
    const poster = posterRef.current;
    const video = videoRef.current;
    const flash = flashRef.current;

    try {
      if (poster) {
        poster.style.opacity = "1";
        poster.style.display = "block";
        poster.style.pointerEvents = "none";
      }
    } catch {}

    try {
      if (video) {
        video.pause();
        video.currentTime = 0;
        video.style.opacity = "0";
        video.style.display = "block";
        video.muted = true;
      }
    } catch {}

    try {
      if (flash) {
        flash.style.opacity = "0";
      }
    } catch {}
  }
     function warmVideo() {
  const video = videoRef.current;

  if (!video) return;

  try {
    video.preload = "auto";
    video.loop = false;
    video.controls = false;
    video.setAttribute("playsinline", "");

    // Importante:
    // No llamar video.load() si el navegador ya empezó a cargar el video,
    // porque puede reiniciar el buffer y provocar pausas al reproducir.
    if (video.readyState === 0) {
      video.muted = true;
      video.load();
    }
  } catch {}
}
  function goHome() {
    if (!props.legalAccepted) {
      props.setLegalError(
        "Para continuar, primero debes aceptar los documentos legales."
      );
      return;
    }

    saveLegalAcceptance();

    try {
      sessionStorage.setItem(PITCH_DONE_KEY, "1");
      sessionStorage.setItem("votoclaro_pitch_done_v1", "1");
      sessionStorage.setItem("votoclaro_user_interacted_v1", "1");
    } catch {}

    savePartyContext(props.partyId);

    const qp = props.partyId ? `&party=${encodeURIComponent(props.partyId)}` : "";

    try {
      window.location.assign(`/?fromPitch=1${qp}`);
    } catch {
      window.location.href = `/?fromPitch=1${qp}`;
    }
  }

      async function playVideoAudioThenGoHome() {
  if (!props.legalAccepted) {
    props.setLegalError(
      "Para continuar, primero debes aceptar los documentos legales."
    );
    return;
  }

  props.setLegalError("");
  saveLegalAcceptance();

  const poster = posterRef.current;
  const video = videoRef.current;
  const flash = flashRef.current;

  if (!video) {
    return;
  }

  try {
    video.onplaying = function () {
      try {
        if (poster) poster.style.opacity = "0";
        video.style.opacity = "1";

        if (!isApp && flash) {
          flash.style.opacity = "0.22";
          setTimeout(() => {
            try {
              flash.style.opacity = "0";
            } catch {}
          }, 120);
        }

        setTimeout(() => {
          try {
            video.muted = false;
            video.defaultMuted = false;
            video.volume = 1;
          } catch {}
        }, 120);
      } catch {}
    };

    video.onended = function () {
      setTimeout(() => {
        goHome();
      }, 250);
    };

    video.onerror = function () {
      try {
        video.pause();
        video.currentTime = 0;
        video.muted = true;
        video.defaultMuted = true;
        video.style.opacity = "0";
        if (poster) poster.style.opacity = "1";
      } catch {}
    };

    video.pause();
    video.currentTime = 0;
    video.loop = false;
    video.controls = false;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 1;
    video.preload = "auto";
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");

    // Mantiene el avatar visible hasta que el evento onplaying confirme
    // que el video realmente empezó.
    video.style.opacity = "0";
    if (poster) poster.style.opacity = "1";

    // IMPORTANTE:
    // No usar await, no esperar loadeddata/canplay y no llamar load() aquí.
    // El play debe ejecutarse inmediatamente dentro del clic del usuario.
    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        try {
          video.pause();
          video.currentTime = 0;
          video.muted = true;
          video.defaultMuted = true;
          video.style.opacity = "0";
          if (poster) poster.style.opacity = "1";
        } catch {}

        props.setLegalError("");
      });
    }
  } catch {
    try {
      video.pause();
      video.currentTime = 0;
      video.muted = true;
      video.defaultMuted = true;
      video.style.opacity = "0";
      if (poster) poster.style.opacity = "1";
    } catch {}

    props.setLegalError("");
  }
}
    React.useEffect(() => {
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  resetVisual();
  warmVideo();

  return () => {
      document.body.style.overflow = prev;

      try {
        const video = videoRef.current;
        if (video) {
          video.pause();
          video.currentTime = 0;
          video.muted = true;
        }
      } catch {}
    };
  }, []);
    
  const welcomeReturn =
    typeof window !== "undefined"
      ? sanitizeInternalReturnPath(window.location.href, window.location.origin)
      : "/pitch";

  return (
    <div
      id="federalito-splash"
      data-party={props.partyId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "block",
        background: isApp ? BG_APP : `${BG_JASPE_SOFT_GREEN}, ${BG_GREEN}`,
        color: TEXT_DARK,
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "28px 18px",
          height: "100vh",
          display: "grid",
          gridTemplateColumns: "1fr",
          alignItems: "center",
          justifyItems: "center",
          gap: 18,
          overflow: "hidden",
        }}
      >
        <div
          className="federalito-anim"
          style={{
            width: isApp ? "min(760px, 95vw)" : "min(520px, 92vw)",
            borderRadius: 22,
            overflow: "hidden",
            border: "none",
            boxShadow: "0 20px 60px rgba(0,0,0,.35)",
            background: isApp ? BG_APP : "transparent",
            position: "relative",
            aspectRatio: isApp ? "16 / 9" : "9 / 16",
            zIndex: 0,
            pointerEvents: "none",
          }}
        >
          <img
            ref={posterRef}
            id="federalito-splash-poster"
            src={assets.avatarSrc}
            alt="Federalito AI"
            draggable={false}
            className="pointer-events-none select-none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: isApp ? "cover" : "contain",
              objectPosition: isApp ? "50% 35%" : "50% 50%",
              transform: "none",
              transformOrigin: "center",
              background: isApp ? BG_APP : "transparent",
              display: "block",
              opacity: 1,
              transition: "opacity 420ms ease",
              willChange: "opacity",
            }}
          />

           <video
  ref={videoRef}
  id="federalito-splash-video"
  src={assets.welcomeVideoSrc}
  muted
  playsInline
  loop={false}
  preload="auto"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: isApp ? "cover" : "contain",
              objectPosition: "50% 50%",
              transform: "none",
              transformOrigin: "center",
              background: isApp ? BG_APP : "transparent",
              display: "block",
              opacity: 0,
              transition: "opacity 420ms ease",
              willChange: "opacity",
              pointerEvents: "none",
            }}
          />

          <div
            ref={flashRef}
            id="federalito-splash-flash"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              background: isApp ? BG_APP : "transparent",
              display: "block",
              opacity: 0,
              transition: "opacity 420ms ease",
              willChange: "opacity",
              pointerEvents: "none",
            }}
          />
        </div>

        <div
          style={{
            textAlign: "center",
            width: "min(760px, 92vw)",
            position: "relative",
            zIndex: 10,
            pointerEvents: "auto",
            background: PANEL_BG,
            border: `3px solid ${RED_BORDER}`,
            borderRadius: 18,
            padding: "10px 12px",
            boxShadow: "0 18px 50px rgba(0,0,0,.22)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              opacity: 0.98,
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 10px",
              border: `2px solid ${RED_BORDER}`,
              borderRadius: 999,
              background: "rgba(255,255,255,.70)",
              color: TEXT_DARK,
              fontWeight: 800,
            }}
          >
            <span style={{ fontWeight: 900 }}>Asistente AI</span>
            <span style={{ opacity: 0.85, fontWeight: 800 }}>
              {" - Guía de Voto Informado"}
            </span>
          </div>

          <h1
            style={{
              marginTop: 14,
              fontSize: 42,
              lineHeight: "46px",
              fontWeight: 900,
              color: TITLE_BLACK,
              textAlign: "center",
              WebkitTextStroke: `1px ${RED_BORDER}`,
              textShadow: "0 6px 14px rgba(0,0,0,0.18)",
            }}
          >
            VOTO_CLARO
          </h1>

          <p
            style={{
              marginTop: 8,
              fontSize: 14,
              lineHeight: "20px",
              opacity: 1,
              color: TEXT_DARK,
              fontWeight: 700,
            }}
          >
            Bienvenido a <b>Voto Claro</b>.
            <br />
            Soy <b>César Acuña Peralta</b> y te invito a este espacio orientado a
            la información, la reflexión y la participación ciudadana.
            <br />
            Aquí podrás explorar candidatos, propuestas, trayectorias, debates
            públicos y diversas formas de involucrarte en la vida política.
          </p>

          <p
            style={{
              marginTop: 6,
              fontSize: 14,
              lineHeight: "20px",
              opacity: 1,
              color: TEXT_DARK,
              fontWeight: 800,
            }}
          >
            <i>
              “La política no solo se observa; también se analiza, se comprende,
              se practica y se decide con responsabilidad.”
            </i>
          </p>

          <div
            style={{
              marginTop: 8,
              border: `2px solid ${RED_BORDER}`,
              borderRadius: 14,
              background: "rgba(255,255,255,.86)",
              padding: "8px 10px",
              textAlign: "left",
              color: TEXT_DARK,
              fontSize: 12,
              lineHeight: "18px",
              fontWeight: 800,
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              Antes de continuar, revisa y acepta los documentos legales de VOTO
              CLARO.
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                id="vc-legal-accepted"
                type="checkbox"
                checked={props.legalAccepted}
                onChange={(e) => {
                  props.setLegalAccepted(e.target.checked);
                  if (e.target.checked) props.setLegalError("");
                }}
                style={{
                  marginTop: 3,
                  width: 16,
                  height: 16,
                  flex: "0 0 auto",
                }}
              />

              <span>
                Declaro que he leído y acepto los{" "}
                <a
                  href={`/terminos?returnTo=${encodeURIComponent(welcomeReturn)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#0D3B9A",
                    textDecoration: "underline",
                    fontWeight: 900,
                  }}
                >
                  Términos y Condiciones
                </a>
                , la{" "}
                <a
                  href={`/privacidad?returnTo=${encodeURIComponent(
                    welcomeReturn
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#0D3B9A",
                    textDecoration: "underline",
                    fontWeight: 900,
                  }}
                >
                  Política de Privacidad
                </a>{" "}
                y el{" "}
                <a
                  href={`/tratamiento-datos?returnTo=${encodeURIComponent(
                    welcomeReturn
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#0D3B9A",
                    textDecoration: "underline",
                    fontWeight: 900,
                  }}
                >
                  Tratamiento de Datos Personales
                </a>
                .
              </span>
            </label>

            <div
              id="vc-legal-error"
              style={{
                display: props.legalError ? "block" : "none",
                marginTop: 8,
                border: `1px solid ${RED_BORDER}`,
                borderRadius: 10,
                background: "#fee2e2",
                padding: "8px 10px",
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 900,
                textAlign: "center",
              }}
            >
              {props.legalError ||
                "Para continuar, primero debes aceptar los documentos legales."}
            </div>
          </div>

           <div
  style={{
    marginTop: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }}
>
            <button
              type="button"
              onClick={props.installApp}
              aria-disabled={!props.legalAccepted}
              style={{
                border: `2px solid ${RED_BORDER}`,
                background: "#0537A8",
                color: BTN_TEXT,
                fontWeight: 900,
                borderRadius: 12,
                padding: "9px 14px",
                fontSize: 13,
                cursor: props.legalAccepted ? "pointer" : "not-allowed",
                opacity: props.legalAccepted ? 1 : 0.55,
                boxShadow: "0 10px 25px rgba(0,0,0,.20)",
                width: "100%",
                marginBottom: "4px",
              }}
            >
              📲 Instalar APP en mi celular
            </button>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                id="federalito-splash-skip"
                type="button"
                onClick={goHome}
                aria-disabled={!props.legalAccepted}
                style={{
                  border: `2px solid ${RED_BORDER}`,
                  background: isApp ? BTN_BG_APP : BTN_BG,
                  color: BTN_TEXT,
                  fontWeight: 900,
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontSize: 13,
                  cursor: props.legalAccepted ? "pointer" : "not-allowed",
                  opacity: props.legalAccepted ? 1 : 0.55,
                  boxShadow: "0 10px 25px rgba(0,0,0,.20)",
                }}
              >
                Saltar
              </button>

                <button
  id="federalito-splash-continue"
  type="button"
  onClick={playVideoAudioThenGoHome}
  disabled={!props.legalAccepted}
  aria-disabled={!props.legalAccepted}
  style={{
    border: `2px solid ${RED_BORDER}`,
    background: isApp ? BTN_BG_APP_2 : BTN_BG_2,
    color: BTN_TEXT,
    fontWeight: 900,
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 13,
    cursor: props.legalAccepted ? "pointer" : "not-allowed",
    opacity: props.legalAccepted ? 1 : 0.55,
    boxShadow: "0 10px 25px rgba(0,0,0,.20)",
  }}
>
  Entrar a VOTO CLARO
</button>
            </div>
          </div>

          <div
  style={{
    marginTop: 6,
    fontSize: 11,
    opacity: 1,
    color: "#0b1220",
    fontWeight: 700,
  }}
>
  Toca “Entrar a VOTO CLARO” para ver la bienvenida o “Saltar” para ir al inicio.
</div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
            .federalito-anim{
            width: min(420px, 96vw) !important;
            aspect-ratio: 4 / 5 !important;
            max-height: 42vh !important;
            margin-top: 8px !important;
            z-index: 0 !important;
           }
            #federalito-splash > div{
            padding: 8px 10px !important;
            gap: 8px !important;
            align-items: start !important;
            }

            #federalito-splash h1{
            margin-top: 6px !important;
            font-size: 32px !important;
            line-height: 34px !important;
            }

            #federalito-splash p{
            margin-top: 6px !important;
            font-size: 13px !important;
            line-height: 18px !important;
          }

          #federalito-splash label{
          font-size: 12px !important;
          line-height: 16px !important;
        }

        #federalito-splash button{
        padding: 8px 12px !important;
        font-size: 13px !important;
        }

        #federalito-splash #federalito-splash-continue,
        #federalito-splash #federalito-splash-skip{
        min-width: 130px !important;
       }

       #federalito-splash [style*="margin-top: 16px"]{
       margin-top: 8px !important;
       }

       #federalito-splash [style*="margin-top: 12px"]{
       margin-top: 6px !important;
       }

       #federalito-splash [style*="padding: 14px 14px"]{
       padding: 8px 10px !important;
      }

      #federalito-splash [style*="padding: 10px 12px"]{
      padding: 7px 9px !important;
      }
          #federalito-splash[data-party="app"] .federalito-anim{
            width: min(96vw, 760px) !important;
            aspect-ratio: 16 / 9 !important;
            max-height: none !important;
            margin-top: 40px !important;
          }

          #federalito-splash-poster{
            pointer-events: none !important;
            user-select: none !important;
          }

          #federalito-splash[data-party="perufederal"] #federalito-splash-video{
            object-fit: cover !important;
            object-position: 50% 12% !important;
            transform: scale(1.08) !important;
            transform-origin: center !important;
          }
        }
      `}</style>
    </div>
  );
}
