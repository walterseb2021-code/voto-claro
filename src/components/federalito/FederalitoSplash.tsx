"use client";

import { useEffect, useState } from "react";

const LS_KEY = "votoclaro_splash_v1";

/**
 * Splash 100% client:
 * - En SSR no renderiza nada (evita hydration mismatch)
 * - Decide mostrar/ocultar recién al montar (leyendo localStorage)
 */
export default function FederalitoSplash() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);

    try {
      const seen = localStorage.getItem(LS_KEY) === "1";
      setOpen(!seen);
    } catch {
      setOpen(true);
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {}
    setOpen(false);
  }

  // ✅ clave: en SSR y antes de montar, no renderizamos nada
  if (!mounted) return null;
  if (!open) return null;

  return (
    <div
      id="federalito-splash"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgb(85,134,45)",

        color: "white",
      }}
    >
      <div
       id="federalito-splash-card"
        style={{
          width: "min(980px, 100%)",
          borderRadius: 20,
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.14)",
          boxShadow: "0 20px 80px rgba(0,0,0,.55)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1.1fr 1.9fr",
        }}
      >
        {/* Izquierda: imagen grande */}
        <div style={{ padding: 18, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {/* 🔁 Cambia el src por tu ruta real (ver nota abajo) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/federalito.png"
            alt="Federalito"
            style={{
              width: "100%",
              maxWidth: 360,
              height: "auto",
              maxHeight: "42vh",
              objectFit: "contain",
              display: "block",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(0,0,0,.25)",
            }}
          />
        </div>

        {/* Derecha: mensaje */}
        <div style={{ padding: 22 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.2 }}>VOTO CLARO</div>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                Con Federalito AI: vota <b>responsable</b> y <b>con evidencia</b>.
              </div>
            </div>

            <button
              type="button"
              onClick={close}
              style={{
                borderRadius: 12,
                padding: "10px 14px",
                background: "rgba(255,255,255,.16)",
                border: "1px solid rgba(255,255,255,.22)",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Entrar
            </button>
          </div>

          <div style={{ marginTop: 16, lineHeight: 1.5, opacity: 0.95 }}>
            Aquí no hacemos “campaña” ni inventamos: <b>leemos documentos</b> (planes de gobierno, hoja de vida y fuentes)
            y respondemos con evidencia. Si algo no aparece en el PDF, diremos: <b>“No hay evidencia suficiente”</b>.
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,.12)",
                border: "1px solid rgba(255,255,255,.18)",
                fontSize: 12,
              }}
            >
              ✅ Fuentes y páginas
            </span>
            <span
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,.12)",
                border: "1px solid rgba(255,255,255,.18)",
                fontSize: 12,
              }}
            >
              ✅ Comparación por ejes
            </span>
            <span
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,.12)",
                border: "1px solid rgba(255,255,255,.18)",
                fontSize: 12,
              }}
            >
              ✅ Modo guía con Federalito
            </span>
          </div>

          <div style={{ marginTop: 18, opacity: 0.85, fontSize: 12 }}>
            Consejo: empieza buscando un candidato y revisa “Hoja de vida” + “Plan de gobierno”.
          </div>
        </div>
      </div>
            <style>{`
        @media (max-width: 640px) {
          #federalito-splash-card {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

    </div>
  );
}
