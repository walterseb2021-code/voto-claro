// src/app/pitch/page.tsx
"use client";

export const dynamic = "force-dynamic";

import Script from "next/script";
import React from "react";
import { supabase } from "@/lib/supabaseClient";
import { PITCH_DONE_KEY } from "@/lib/adminConfig";
import { partyWelcomeAssets, setActiveParty } from "@/lib/partyThemeClient";

type AccessState = "CHECKING" | "GRANTED" | "DENIED" | "MISSING_TOKEN";

// 🎨 COLORES
// ✅ Perú Federal (verde)
const BG_GREEN = "rgb(83,129,39)";
const BG_JASPE_SOFT_GREEN =
  "radial-gradient(1200px 800px at 20% 10%, rgba(255,255,140,.07), transparent 45%)," +
  "radial-gradient(900px 700px at 80% 20%, rgba(255,245,120,.06), transparent 50%)," +
  "radial-gradient(1000px 900px at 50% 90%, rgba(255,235,110,.05), transparent 55%)";

// ✅ APP (AZUL REAL del video): RGB(5,55,168) → #0537A8
const BG_APP = "#0537A8";

// (No se usa en APP ahora, se deja por si luego quieres “jaspe”)
const BG_JASPE_SOFT_APP =
  "radial-gradient(1200px 800px at 20% 10%, rgba(190,220,255,.10), transparent 45%)," +
  "radial-gradient(900px 700px at 80% 20%, rgba(160,205,255,.08), transparent 50%)," +
  "radial-gradient(1000px 900px at 50% 90%, rgba(210,235,255,.08), transparent 55%)";

const PANEL_BG = "rgba(255,255,255,.78)";
const TEXT_DARK = "#0f172a";
const TITLE_BLACK = "#0b0b0b";
const RED_BORDER = "#b91c1c";
const BTN_BG = "#14532d"; // Perú Federal (verde)
const BTN_BG_2 = "#166534"; // Perú Federal (verde variante)

// ✅ APP (azul) — base y hover
const BTN_BG_APP = BG_APP; // #0537A8
const BTN_BG_APP_2 = "#0D3B9A"; // más oscuro
const BTN_TEXT = "#ffffff";

export default function PitchPage() {
  const [access, setAccess] = React.useState<AccessState>("CHECKING");
  const [party, setParty] = React.useState<"perufederal" | "app">("perufederal");
  
  // 🔹 NUEVO: Estado para la instalación PWA
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstallable, setIsInstallable] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    async function checkAccess() {
      try {
        if (typeof window === "undefined") return;

        const url = new URL(window.location.href);
        const token = (url.searchParams.get("t") ?? "").trim();

        // ✅ Definir partido activo según token (reactivo + persistido)
        // GRUPOB y GRUPOC apuntan a Alianza por el Progreso (app)
        const nextParty = (token.startsWith("GRUPOB-") || token.startsWith("GRUPOC-")) ? "app" : "perufederal";
        setParty(nextParty);
        setActiveParty(nextParty);

        // ✅ Requiere token en la URL
        if (!token) {
          if (alive) setAccess("MISSING_TOKEN");
          return;
        }

        // ✅ Validar token en Supabase (solo si está activo)
        const { data, error } = await supabase
          .from("votoclaro_public_links")
          .select("id")
          .eq("route", "/pitch")
          .eq("token", token)
          .eq("is_active", true)
          .limit(1);

        console.log("[Pitch][DEBUG] token:", token);
        console.log("[Pitch][DEBUG] data:", data);
        console.log("[Pitch][DEBUG] error:", error);

        if (error) {
          console.error("[Pitch] token check error:", error);
          if (alive) setAccess("DENIED");
          return;
        }

        const ok = Array.isArray(data) && data.length > 0;

        if (ok) {
          try {
            // 🔐 activar gate server-side (cookie HttpOnly)
            const res = await fetch("/api/gate/pitch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({ token }),
            });

            if (!res.ok) {
              console.error("[Pitch] gate API failed");
              if (alive) setAccess("DENIED");
              return;
            }

            // ✅ Mantener sessionStorage (UX)
            sessionStorage.setItem("votoclaro_pitch_done_v1", "1");
            sessionStorage.setItem("votoclaro_pitch_token_v1", token);
            sessionStorage.setItem(PITCH_DONE_KEY, "1");
          } catch (e) {
            console.error("[Pitch] gate activation error:", e);
            if (alive) setAccess("DENIED");
            return;
          }
        }

        if (alive) setAccess(ok ? "GRANTED" : "DENIED");
      } catch (e) {
        console.error("[Pitch] token check exception:", e);
        if (alive) setAccess("DENIED");
      }
    }

    checkAccess();
    return () => {
      alive = false;
    };
  }, []);

  // 🔹 NUEVO: Detectar si la app es instalable (PWA) - VERSIÓN MEJORADA
  React.useEffect(() => {
    let isMounted = true;
    
    const handleBeforeInstallPrompt = (e: any) => {
      console.log("📲 Evento beforeinstallprompt CAPTURADO");
      // Prevenir que Chrome muestre el mini-infobar automáticamente
      e.preventDefault();
      // Guardar el evento para usarlo después
      if (isMounted) {
        setDeferredPrompt(e);
        setIsInstallable(true);
      }
    };

    // También verificar si ya está instalada
    const checkIfInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log("📱 App ya está instalada");
        if (isMounted) setIsInstallable(false);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Verificar estado actual
    checkIfInstalled();

    // Forzar re-evaluación después de 2 segundos (para casos lentos)
    const timeoutId = setTimeout(() => {
      if (isMounted && !deferredPrompt) {
        console.log("🔍 Re-verificando instalabilidad...");
        // Intentar disparar manualmente (simula interacción)
        window.dispatchEvent(new Event('beforeinstallprompt'));
      }
    }, 2000);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timeoutId);
    };
  }, [deferredPrompt]);

// 🔹 NUEVO: Función para instalar la app (con fallback)
const installApp = async () => {
  if (deferredPrompt) {
    // Si tenemos el evento guardado, úsalo
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Usuario ${outcome === 'accepted' ? 'instaló' : 'canceló'} la app`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  } else {
    // Fallback: instrucciones manuales
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Voto Claro',
          text: 'Instala la app desde el menú del navegador',
          url: window.location.href
        });
      } catch (e) {
        showManualInstructions();
      }
    } else {
      showManualInstructions();
    }
  }
};

// Función auxiliar para mostrar instrucciones
const showManualInstructions = () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  
  let message = '';
  if (isIOS) {
    message = 'Para instalar en iPhone:\n\n1. Toca el icono de compartir (cuadro con flecha)\n2. Desliza hacia abajo\n3. Toca "Agregar a pantalla de inicio"';
  } else if (isAndroid) {
    message = 'Para instalar en Android:\n\n1. Toca los 3 puntos (menú)\n2. Selecciona "Instalar aplicación"';
  } else {
    message = 'Para instalar:\n\nBusca "Instalar aplicación" en el menú del navegador';
  }
  
  alert(message);
};

  if (access === "CHECKING") {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: party === "app" ? BG_APP : BG_GREEN, color: TEXT_DARK }}
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
          <div className="mt-2 text-sm" style={{ color: TEXT_DARK, fontWeight: 700 }}>
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
        style={{ background: party === "app" ? BG_APP : BG_GREEN, color: TEXT_DARK }}
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

          <p className="mt-3 text-sm leading-relaxed" style={{ color: TEXT_DARK, fontWeight: 700 }}>
            Debes ingresar con un enlace válido que incluya un token.
            <br />
            Ejemplo: <b>/pitch?t=GRUPOA-2026-01</b>
          </p>
        </div>
      </main>
    );
  }

  if (access === "DENIED") {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: party === "app" ? BG_APP : BG_GREEN, color: TEXT_DARK }}
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

          <p className="mt-3 text-sm leading-relaxed" style={{ color: TEXT_DARK, fontWeight: 700 }}>
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

  return <FederalitoSplash partyId={party} isInstallable={isInstallable} installApp={installApp} />;
}

function FederalitoSplash(props: { 
  partyId: "perufederal" | "app";
  isInstallable: boolean;
  installApp: () => Promise<void>;
}) {
  const isApp = props.partyId === "app";
  const assets = partyWelcomeAssets(props.partyId);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      id="federalito-splash"
      data-party={props.partyId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "block",
        // ✅ APP: sólido EXACTO #0537A8 (sin gradientes/overlays)
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
            width: isApp ? "min(600px, 95vw)" : "min(520px, 92vw)",
            borderRadius: 22,
            overflow: "hidden",
            border: "none",
            boxShadow: "0 20px 60px rgba(0,0,0,.35)",
            // ✅ APP: contenedor EXACTO #0537A8 (bloque uniforme)
            background: isApp ? BG_APP : "transparent",
            position: "relative",
            aspectRatio: "9 / 16",
            zIndex: 0,
            pointerEvents: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
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
              objectFit: "contain",
              objectPosition: "50% 50%",
              transform: isApp ? "scale(0.90)" : "none",
              transformOrigin: "center",
              // ✅ APP: fondo EXACTO #0537A8
              background: isApp ? BG_APP : "transparent",
              display: "block",
              opacity: 1,
              transition: "opacity 420ms ease",
              willChange: "opacity",
            }}
          />

          <video
            id="federalito-splash-video"
            src={assets.welcomeVideoSrc}
            muted
            playsInline
            loop={false}
            preload="metadata"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              // ✅ SIEMPRE contain (no cover)
              objectFit: "contain",
              objectPosition: "50% 50%",
              transform: isApp ? "scale(1.46)" : "none",
              transformOrigin: "center",
              // ✅ APP: el video “rellena” con EXACTO #0537A8
              background: isApp ? BG_APP : "transparent",
              display: "block",
              opacity: 0,
              transition: "opacity 420ms ease",
              willChange: "opacity",
              pointerEvents: "none",
            }}
          />

          <div
            id="federalito-splash-flash"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              // (No aplica objectFit a div, se deja limpio)
              // ✅ APP: si llegara a mostrarse, mantiene EXACTO #0537A8
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
            padding: "14px 14px",
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
            <span style={{ opacity: 0.85, fontWeight: 800 }}>{" - Guía de Voto Informado"}</span>
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
              marginTop: 12,
              fontSize: 15,
              lineHeight: "22px",
              opacity: 1,
              color: TEXT_DARK,
              fontWeight: 700,
            }}
          >
            Bienvenido a <b>Voto Claro</b>. Aquí encontrarás documentos (Planes de Gobierno, Hojas de Vida e información de
            fuentes confiables).
            <br />
            Te mostraremos <b>evidencias verificables</b> para ayudarte a identificar propuestas coherentes con la realidad
            actual (nacional e internacional) y un candidato/a con trayectoria y conducta pública consistente con lo que
            promete.
          </p>

          <p
            style={{
              marginTop: 10,
              fontSize: 15,
              lineHeight: "22px",
              opacity: 1,
              color: TEXT_DARK,
              fontWeight: 800,
            }}
          >
            <i>“Un voto responsable empieza con información verificable.”</i>
          </p>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Botones principales en fila */}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {/* 🔹 Botón de instalación PWA (solo si es instalable) */}
              {props.isInstallable && (
                <button
                  onClick={props.installApp}
                  style={{
                    border: `2px solid ${RED_BORDER}`,
                    background: "#0537A8",
                    color: BTN_TEXT,
                    fontWeight: 900,
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: "0 10px 25px rgba(0,0,0,.20)",
                  }}
                >
                  📲 Instalar App
                </button>
              )}
              
              <button
                id="federalito-splash-skip"
                type="button"
                style={{
                  border: `2px solid ${RED_BORDER}`,
                  background: isApp ? BTN_BG_APP : BTN_BG,
                  color: BTN_TEXT,
                  fontWeight: 900,
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: "0 10px 25px rgba(0,0,0,.20)",
                }}
              >
                Saltar
              </button>

              <button
                id="federalito-splash-continue"
                type="button"
                style={{
                  border: `2px solid ${RED_BORDER}`,
                  background: isApp ? BTN_BG_APP_2 : BTN_BG_2,
                  color: BTN_TEXT,
                  fontWeight: 900,
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: "0 10px 25px rgba(0,0,0,.20)",
                }}
              >
                Entrar a VOTO CLARO
              </button>
            </div>

            {/* 🔹 Botón de respaldo con instrucciones (siempre visible si no es instalable) */}
            {!props.isInstallable && (
              <div style={{ marginTop: 8, width: "100%" }}>
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: 'Voto Claro',
                        text: 'Instala la app desde el menú del navegador',
                        url: window.location.href
                      });
                    } else {
                      alert('Para instalar la app:\n\n1. Toca los 3 puntos (menú)\n2. Selecciona "Instalar aplicación"');
                    }
                  }}
                  style={{
                    border: `2px solid ${RED_BORDER}`,
                    background: "#ffffff",
                    color: "#0537A8",
                    fontWeight: 900,
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    boxShadow: "0 10px 25px rgba(0,0,0,.20)",
                    width: "100%"
                  }}
                >
                  ℹ️ Cómo instalar esta app
                </button>
                <p style={{ fontSize: 11, color: TEXT_DARK, margin: "8px 0 0 0" }}>
                  Si no ves el botón "Instalar App", toca los 3 puntos del navegador y elige "Instalar aplicación"
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 1, color: "#0b1220", fontWeight: 700 }}>
            La voz del video se reproduce al hacer clic en “Entrar”. Puedes usar “Saltar” si no deseas ver la presentación.
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .federalito-anim{
            width: min(420px, 96vw) !important;
            aspect-ratio: 4 / 5 !important;
            max-height: 46vh !important;
            margin-top: 100px !important;
            z-index: 0 !important;
          }

          #federalito-splash-poster{
            pointer-events: none !important;
            user-select: none !important;
          }

          /* ✅ SOLO PerúFederal puede aplicar “cover” en móvil.
             ✅ APP mantiene contain (sin forzar cover, sin bordes lavados) */
          #federalito-splash[data-party="perufederal"] #federalito-splash-video{
            object-fit: cover !important;
            object-position: 50% 12% !important;
            transform: scale(1.08) !important;
            transform-origin: center !important;
          }
        }
      `}</style>

      <Script
        id="federalito-splash-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
(function(){
  try{
    var splash = document.getElementById("federalito-splash");
    var skip = document.getElementById("federalito-splash-skip");
    var cont = document.getElementById("federalito-splash-continue");
    var poster = document.getElementById("federalito-splash-poster");
    var video = document.getElementById("federalito-splash-video");
    var flash = document.getElementById("federalito-splash-flash");

    var KEY = "votoclaro_pitch_done_v1";

function goHome(){
  try{ sessionStorage.setItem(KEY, "1"); }catch(e){}
  try{ sessionStorage.setItem("votoclaro_user_interacted_v1","1"); }catch(e){}

  // ✅ Detectar party actual (app o perufederal)
  var party = "";
  try{ party = (splash && splash.dataset && splash.dataset.party) ? splash.dataset.party : ""; }catch(e){}

  // ✅ Persistir party de forma "a prueba de balas" (varias keys + cookie)
  try{
    if(party){
      // sessionStorage
      sessionStorage.setItem("votoclaro_active_party_v1", party);
      sessionStorage.setItem("active_party", party);
      sessionStorage.setItem("party", party);
      sessionStorage.setItem("votoclaro_party", party);

      // localStorage
      localStorage.setItem("votoclaro_active_party_v1", party);
      localStorage.setItem("active_party", party);
      localStorage.setItem("party", party);
      localStorage.setItem("votoclaro_party", party);

      // cookie (por si el middleware/SSR lo usa)
      document.cookie = "votoclaro_party=" + encodeURIComponent(party) + "; path=/; max-age=31536000; samesite=lax";
    }
  }catch(e){}

  // ✅ Ir a inicio SIEMPRE, pero pasando party en la URL también
  var qp = party ? ("&party=" + encodeURIComponent(party)) : "";
  try{ window.location.assign("/?fromPitch=1" + qp); }
  catch(e){ window.location.href = "/?fromPitch=1" + qp; }
}

    function resetVisual(){
      try{ if(poster){ poster.style.opacity = "1"; poster.style.display = "block"; poster.style.pointerEvents = "none"; } }catch(e){}
      try{ if(video){ video.style.opacity = "0"; video.style.display = "block"; video.muted = true; } }catch(e){}
      try{ if(flash){ flash.style.opacity = "0"; } }catch(e){}
    }

    function hide(cancelAudio){
      if(!splash) return;
      splash.style.display = "none";

      if(cancelAudio){
        try{
          if(video && typeof video.pause === "function"){
            video.pause();
            video.currentTime = 0;
            video.muted = true;
          }
        }catch(e){}
        try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(e){}
      }

      resetVisual();
    }

    function show(){
      if(!splash) return;
      splash.style.display = "block";
      resetVisual();
    }

    show();

    if(skip) skip.addEventListener("click", function(){
      hide(true);
      goHome();
    });

    window.addEventListener("keydown", function(ev){
      if(ev.key === "Escape"){
        hide(true);
        goHome();
      }
    });

    async function playVideoAudioThenGoHome(){
      try{
        if(!video){
          hide(false);
          goHome();
          return;
        }

        try{ video.pause(); }catch(e){}
        try{ video.currentTime = 0; }catch(e){}
        video.muted = false;
        video.volume = 1;

        try{
          void video.offsetHeight;
          if(poster) void poster.offsetHeight;
        }catch(e){}

        /* ✅ En APP NO hacemos “flash overlay” (evita cambio de tono).
           ✅ Mantiene el resto de animaciones (fade poster/video). */
        try{
          var isApp = false;
          try{
            if(splash && splash.dataset && splash.dataset.party === "app") isApp = true;
          }catch(e){}
          if(!isApp){
            if(flash){
              flash.style.opacity = "0.22";
              setTimeout(function(){ try{ flash.style.opacity = "0"; }catch(e){} }, 120);
            }
          }
        }catch(e){}

        requestAnimationFrame(function(){
          try{ if(poster) poster.style.opacity = "0"; }catch(e){}
          try{ if(video) video.style.opacity = "1"; }catch(e){}
        });

        try{
          video.onended = function(){
            setTimeout(function(){
              hide(false);
              goHome();
            }, 250);
          };
        }catch(e){}

        var p = video.play();
        if(p && typeof p.then === "function"){
          p.then(function(){}).catch(function(){
            hide(false);
            goHome();
          });
        }
      }catch(e){
        hide(false);
        goHome();
      }
    }

    if(cont) cont.addEventListener("click", function(){
      playVideoAudioThenGoHome();
    });

  }catch(e){}
})();`,
        }}
      />
    </div>
  );
}