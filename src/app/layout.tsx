// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Suspense } from "react";
import FederalitoClientRoot from "@/components/assistant/FederalitoClientRoot";

// ✅ Panel asistente (FAB + voz)

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VotoClaro",
  description: "Información verificable de candidatos: HV, plan y actuar político.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body
        className={[
          geistSans.variable,
          geistMono.variable,
          "antialiased",
          "min-h-screen",
          "bg-gradient-to-b",
          "from-green-50",
          "via-white",
          "to-green-100",
          "text-slate-900",
        ].join(" ")}
      >
     {/* ✅ Federalito SIEMPRE primero (listener garantizado) */}
<FederalitoClientRoot />

{/* Splash encima, pero NO antes del asistente */}
<FederalitoSplash />

{children}

      </body>
    </html>
  );
}

/**
 * ✅ Splash profesional:
 * - Al cargar: muestra PNG quieto (poster)
 * - Al hacer clic en “Entrar”: transición PNG → video + reproduce con voz
 * - Al terminar el video: cierra splash automáticamente
 * - “Saltar”: c attachment (y corta audio/video)
 *
 * Requisitos:
 * - public/federalito.png       → "/federalito.png"
 * - public/media/federalito.mp4 → "/media/federalito.mp4"
 */
function FederalitoSplash() {
  return (
    <div
      id="federalito-splash"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "none",
        background: "linear-gradient(180deg, rgba(0,0,0,.92), rgba(0,0,0,.82))",
        color: "white",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "28px 18px",
          height: "100%",
          display: "grid",
          gridTemplateColumns: "1fr",
          alignItems: "center",
          justifyItems: "center",
          gap: 18,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",

        }}
      >
        {/* CONTENEDOR PRO (misma caja para PNG y video) */}
        <div
          className="federalito-anim"
          style={{
            width: "min(520px, 92vw)",
            borderRadius: 22,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,.18)",
            boxShadow: "0 20px 60px rgba(0,0,0,.35)",
            background: "rgba(255,255,255,.06)",
            position: "relative",
            aspectRatio: "9 / 16",
          }}
        >
          {/* ✅ PNG QUIETO (se ve al inicio) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            id="federalito-splash-poster"
            src="/federalito.png"
            alt="Federalito AI"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "center",
              background: "rgba(0,0,0,.35)",

              display: "block",
              opacity: 1,
              transition: "opacity 420ms ease",
              willChange: "opacity",
            }}
          />

          {/* ✅ VIDEO (montado desde el inicio con opacity 0 para poder animar) */}
          <video
            id="federalito-splash-video"
            src="/media/federalito.mp4"
            muted
            playsInline
            loop={false}
            preload="metadata"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",

              display: "block",
              opacity: 0,
              transition: "opacity 420ms ease",
              willChange: "opacity",
              pointerEvents: "none",
            }}
          />

          {/* ✅ NUEVO: destello sutil (ultra profesional) */}
          <div
            id="federalito-splash-flash"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.0)",
              opacity: 0,
              pointerEvents: "none",
              transition: "opacity 120ms ease",
              willChange: "opacity",
            }}
          />
        </div>

        
        <div style={{ textAlign: "center", width: "min(760px, 92vw)" }}>
          <div
            style={{
              fontSize: 14,
              opacity: 0.9,
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 10px",
              border: "1px solid rgba(255,255,255,.16)",
              borderRadius: 999,
              background: "rgba(255,255,255,.06)",
            }}
          ></div>
          <div
            style={{
              fontSize: 14,
              opacity: 0.9,
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 10px",
              border: "1px solid rgba(255,255,255,.16)",
              borderRadius: 999,
              background: "rgba(255,255,255,.06)",
            }}
          >
            <span style={{ fontWeight: 700 }}>Federalito AI</span>
            <span style={{ opacity: 0.8 }}>• guía de voto informado</span>
          </div>

         <h1
  style={{
    position: "absolute",
    top: "34vh",          // 👈 controla la altura del título
    left: "50%",
    transform: "translateX(-50%)",

    fontSize: 36,
    lineHeight: "40px",
    fontWeight: 900,

    zIndex: 20,           // 👈 SIEMPRE encima de imagen/video
    color: "white",
    textShadow: "0 4px 12px rgba(0,0,0,0.85)",
    pointerEvents: "none",
  }}
>
  VOTO_CLARO
</h1>

          <p style={{ marginTop: 12, fontSize: 15, lineHeight: "22px", opacity: 0.92 }}>
            Bienvenido a <b>Voto Claro</b>. Aquí encontrarás documentos (Planes de Gobierno, Hojas de Vida e información de
            fuentes confiables).
            <br />
            Te mostraremos <b>evidencias verificables</b> para ayudarte a identificar propuestas coherentes con la realidad
            actual (nacional e internacional) y un candidato/a con trayectoria y conducta pública consistente con lo que
            promete.
          </p>

          <p style={{ marginTop: 10, fontSize: 15, lineHeight: "22px", opacity: 0.92 }}>
            <i>“Un voto responsable empieza con información verificable.”</i>
          </p>

          <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              id="federalito-splash-skip"
              type="button"
              style={{
                border: "1px solid rgba(255,255,255,.22)",
                background: "rgba(255,255,255,.08)",
                color: "white",
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Saltar
            </button>

            <button
              id="federalito-splash-continue"
              type="button"
              style={{
                border: "none",
                background: "white",
                color: "black",
                borderRadius: 12,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Entrar a VotoClaro
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            La voz del video se reproduce al hacer clic en “Entrar”. Puedes usar “Saltar” si no deseas ver la presentación.
          </div>
        </div>
      </div>

      {/* ✅ FIX RESPONSIVE (NO rompe el script): SOLO afecta CELULAR */}
           <style>{`
        @media (max-width: 640px) {

          /* 1) El “cuadro” donde vive Federalito: más chico en móvil */
          .federalito-anim{
            width: min(360px, 88vw) !important;
            aspect-ratio: 4 / 5 !important;   /* menos alto que 9/16 */
            max-height: 46vh !important;      /* evita que se coma toda la pantalla */
              margin-top: 100px !important;      /* BAJA el cuadro en pantalla */
              z-index: 0 !important;
          }

          /* 2) POSTER (PNG): mostrarlo completo (incluye bandera y brazo) */
          #federalito-splash-poster{
            object-fit: contain !important;
            object-position: center top !important; /* prioriza la parte alta (bandera) */
            background: rgba(0,0,0,.35) !important;
          }

          /* 3) VIDEO: bajar el zoom (1.35 era demasiado) + encuadre arriba */
          #federalito-splash-video{
            object-fit: cover !important;
            object-position: 50% 12% !important;  /* sube el encuadre para que entre bandera */
            transform: scale(1.08) !important;     /* zoom MUCHO más leve */
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

    var SESSION_KEY = "votoclaro_splash_session_v1";

    function resetVisual(){
      try{ if(poster){ poster.style.opacity = "1"; poster.style.display = "block"; } }catch(e){}
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

    function markSeen(){
      try{ sessionStorage.setItem(SESSION_KEY, "1"); }catch(e){}
    }

    var seen = null;
    try{ seen = sessionStorage.getItem(SESSION_KEY); }catch(e){}
    if(!seen){
      show();
    }else{
      hide(true);
    }

    function waitVoices(timeoutMs){
      return new Promise(function(resolve){
        var start = Date.now();
        function check(){
          var v = [];
          try{ v = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }catch(e){}
          if(v && v.length) return resolve(v);
          if(Date.now() - start > (timeoutMs || 1200)) return resolve(v);
          setTimeout(check, 120);
        }
        try{
          var onChanged = function(){
            var v = [];
            try{ v = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }catch(e){}
            if(v && v.length){
              try{ window.speechSynthesis.removeEventListener("voiceschanged", onChanged); }catch(e){}
              resolve(v);
            }
          };
          if(window.speechSynthesis && window.speechSynthesis.addEventListener){
            window.speechSynthesis.addEventListener("voiceschanged", onChanged);
          }
        }catch(e){}
        check();
      });
    }

    function pickBestSpanishVoice(voices){
      try{
        if(!voices || !voices.length) return null;

        function norm(s){
          return (s||"").toLowerCase().normalize("NFD").replace(/\\p{Diacritic}/gu,"");
        }

        var scored = voices.map(function(v){
          var name = norm(v.name||"");
          var lang = norm(v.lang||"");
          var score = 0;

          if(name.includes("google")) score += 30;
          if(name.includes("microsoft")) score += 25;

          if(lang === "es-pe") score += 60;
          if(lang.startsWith("es-")) score += 35;
          if(lang.includes("es-419")) score += 25;

          if(v.localService) score += 10;

          return { v: v, score: score };
        });

        scored.sort(function(a,b){ return b.score - a.score; });
        return scored[0] ? scored[0].v : null;
      }catch(e){
        return null;
      }
    }

    async function speakFallbackThenHide(){
      var msg = "Bienvenido a Voto Claro. Aquí encontrarás documentos como Planes de Gobierno, Hojas de Vida e información de fuentes confiables. Te mostraremos evidencias verificables para ayudarte a identificar propuestas coherentes con la realidad actual, nacional e internacional, y un candidato o candidata con conducta pública consistente con lo que promete. Un voto responsable empieza con información verificable.";

      try{
        if(!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined"){
          markSeen(); hide(false); return;
        }

        window.speechSynthesis.cancel();

        var voices = await waitVoices(1200);
        var v = pickBestSpanishVoice(voices);

        var u = new SpeechSynthesisUtterance(msg);
        u.lang = "es-PE";
        u.rate = 1.02;
        u.pitch = 0.78;
        if(v) u.voice = v;

        u.onend = function(){ markSeen(); setTimeout(function(){ hide(false); }, 250); };
        u.onerror = function(){ markSeen(); hide(false); };

        window.speechSynthesis.speak(u);
      }catch(e){
        markSeen(); hide(false);
      }
    }

    async function playVideoAudioThenHide(){
      try{
        if(!video){
          return speakFallbackThenHide();
        }

        try{ video.pause(); }catch(e){}
        try{ video.currentTime = 0; }catch(e){}
        video.muted = false;
        video.volume = 1;

        // ✅ Forzar repaint (como ya te funcionó)
        try{
          void video.offsetHeight;
          void poster.offsetHeight;
        }catch(e){}

        // ✅ Destello sutil (pro)
        try{
          if(flash){
            flash.style.opacity = "0.22";
            setTimeout(function(){ try{ flash.style.opacity = "0"; }catch(e){} }, 120);
          }
        }catch(e){}

        // ✅ Crossfade
        requestAnimationFrame(function(){
          try{ if(poster) poster.style.opacity = "0"; }catch(e){}
          try{ if(video) video.style.opacity = "1"; }catch(e){}
        });

        try{
          video.onended = function(){
            markSeen();
            setTimeout(function(){ hide(false); }, 250);
          };
        }catch(e){}

        var p = video.play();
        if(p && typeof p.then === "function"){
          p.then(function(){}).catch(function(){
            speakFallbackThenHide();
          });
        }
      }catch(e){
        speakFallbackThenHide();
      }
    }

    if(skip) skip.addEventListener("click", function(){
      markSeen();
      hide(true);
    });

    if(cont) cont.addEventListener("click", function(){
      playVideoAudioThenHide();
    });

    window.addEventListener("keydown", function(ev){
      if(ev.key === "Escape"){
        markSeen();
        hide(true);
      }
    });

    window.__federalitoSplashShow = function(){ show(); };
    window.__federalitoSplashHide = function(){ markSeen(); hide(true); };

  }catch(e){}
})();`,
        }}
      />
    </div>
  );
}
