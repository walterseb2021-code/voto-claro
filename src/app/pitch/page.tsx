// src/app/pitch/page.tsx
"use client";

import Script from "next/script";
import React from "react";

export default function PitchPage() {
  return <FederalitoSplash />;
}

/**
 * ✅ Splash profesional:
 * - Vive SOLO en /pitch
 * - En /pitch SIEMPRE se muestra
 * - Solo navega a / cuando el usuario hace clic (Saltar/Entrar) o termina el video
 */
function FederalitoSplash() {
  // ✅ Bloquear scroll del body mientras el splash está activo
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "block",
        background: "linear-gradient(180deg, rgba(0,0,0,.92), rgba(0,0,0,.82))",
        color: "white",
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
            zIndex: 0,
            pointerEvents: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            id="federalito-splash-poster"
            src="/federalito.png"
            alt="Federalito AI"
            draggable={false}
            className="pointer-events-none select-none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              background: "rgba(0,0,0,.35)",
              display: "block",
              opacity: 1,
              transition: "opacity 420ms ease",
              willChange: "opacity",
            }}
          />

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

        <div
          style={{
            textAlign: "center",
            width: "min(760px, 92vw)",
            position: "relative",
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
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
              marginTop: 16,
              fontSize: 42,
              lineHeight: "46px",
              fontWeight: 900,
              color: "white",
              textAlign: "center",
              textShadow: "0 4px 12px rgba(0,0,0,0.85)",
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

      <style>{`
        @media (max-width: 640px) {
          .federalito-anim{
            width: min(360px, 88vw) !important;
            aspect-ratio: 4 / 5 !important;
            max-height: 46vh !important;
            margin-top: 100px !important;
            z-index: 0 !important;
          }

          #federalito-splash-poster{
            pointer-events: none !important;
            user-select: none !important;
          }

          #federalito-splash-video{
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
      try{ window.location.assign("/?fromPitch=1"); }catch(e){ window.location.href = "/?fromPitch=1"; }
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

        try{
          if(flash){
            flash.style.opacity = "0.22";
            setTimeout(function(){ try{ flash.style.opacity = "0"; }catch(e){} }, 120);
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
