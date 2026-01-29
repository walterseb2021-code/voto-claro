// src/components/federalito/FederalitoGuide.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type RouteContext =
  | "HOME"
  | "CANDIDATE"
  | "CANDIDATE_PLAN"
  | "CANDIDATE_HV"
  | "CANDIDATE_NEWS"
  | "CANDIDATE_COMPARE"
  | "OTHER";

type GuideMsg = {
  title: string;
  text: string;
};

type GuideLog = { from: "federalito" | "user"; text: string };

function safeLocalStorageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function pickMasculineSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  if (!voices.length) return null;

  const es = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("es"));
  const pool = es.length ? es : voices;

  const preferredByName = pool.find((v) => /male|hombre|masc/i.test(v.name));
  if (preferredByName) return preferredByName;

  return pool[0] ?? null;
}

function getRouteContext(pathname: string, tab: string | null): RouteContext {
  const p = pathname || "/";
  const t = (tab || "").toUpperCase();

  if (p === "/") return "HOME";

  if (p.startsWith("/candidate/")) {
    if (t === "PLAN") return "CANDIDATE_PLAN";
    if (t === "HV") return "CANDIDATE_HV";
    if (t === "NEWS") return "CANDIDATE_NEWS";
    if (t === "COMPARE") return "CANDIDATE_COMPARE";
    return "CANDIDATE";
  }

  return "OTHER";
}

function getGuideMessage(ctx: RouteContext): GuideMsg {
  switch (ctx) {
    case "HOME":
      return {
        title: "Inicio (Búsqueda)",
        text:
          "Escribe el nombre (mínimo 2 letras) y entra a la ficha del candidato para revisar documentos y fuentes.",
      };
    case "CANDIDATE":
      return {
        title: "Ficha del candidato",
        text:
          "Estás en la ficha. Usa las pestañas para ver Hoja de Vida, Plan y fuentes. Si algo no aparece en documentos, lo diremos claramente.",
      };
    case "CANDIDATE_PLAN":
      return {
        title: "Plan de Gobierno",
        text:
          "En esta pestaña revisas propuestas del Plan. La app muestra fragmentos y páginas donde aparece la información. Si no aparece, lo diremos claro.",
      };
    case "CANDIDATE_HV":
      return {
        title: "Hoja de Vida",
        text:
          "Aquí se consulta la Hoja de Vida. Verifica datos, experiencia y organización política.",
      };
    case "CANDIDATE_NEWS":
      return {
        title: "Actuar político / Noticias",
        text:
          "Aquí se muestran fuentes para entender el actuar político. Priorizamos enlaces y evidencia; si no hay sustento, no afirmamos.",
      };
    case "CANDIDATE_COMPARE":
      return {
        title: "Comparación",
        text:
          "Aquí comparas a dos candidatos por tema. La comparación se basa en documentos, no en opiniones.",
      };
    default:
      return {
        title: "Guía",
        text: "Dime qué quieres hacer y te indico el camino dentro de la app.",
      };
  }
}

/**
 * ✅ EVENTO PUENTE (PASO B)
 * Evento: window.dispatchEvent(new CustomEvent("votoclaro:guide", { detail: {...} }))
 *
 * detail:
 * - action: "OPEN" | "CLOSE" | "SAY" | "USER" | "SET_INPUT" | "SAY_AND_OPEN"
 * - text?: string
 * - speak?: boolean (default true)
 */
type GuideEventDetail = {
  action: "OPEN" | "CLOSE" | "SAY" | "USER" | "SET_INPUT" | "SAY_AND_OPEN";
  text?: string;
  speak?: boolean;
};

export default function FederalitoGuide() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = sp.get("tab");
  const ctx = useMemo(() => getRouteContext(pathname, tab), [pathname, tab]);

  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState<GuideMsg>(() => getGuideMessage(ctx));
  const [userText, setUserText] = useState("");
  const [log, setLog] = useState<GuideLog[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gifOk, setGifOk] = useState(true);

  const [isListening, setIsListening] = useState(false);
  const recogRef = useRef<any>(null);

  const dismissKey = useMemo(() => `votoclaro_federalito_guide_open_v1`, []);
  const lastCtxKey = useMemo(() => `votoclaro_federalito_last_ctx_v1`, []);

  function stopSpeak() {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    setIsSpeaking(false);
  }

  function speak(text: string) {
    try {
      if (typeof window === "undefined") return;
      if (!voiceEnabled) return;
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;

      stopSpeak();

      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-PE";
      u.pitch = 0.75;
      u.rate = 1.0;

      const v = pickMasculineSpanishVoice();
      if (v) u.voice = v;

      u.onstart = () => setIsSpeaking(true);
      u.onend = () => setIsSpeaking(false);
      u.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(u);
    } catch {
      setIsSpeaking(false);
    }
  }

  function toggleOpen(next: boolean) {
    setOpen(next);
    safeLocalStorageSet(dismissKey, next ? "1" : "0");
    if (!next) stopSpeak();
  }

  // 1) Restaurar estado open
  useEffect(() => {
    const saved = safeLocalStorageGet(dismissKey);
    if (saved === "0") setOpen(false);
  }, [dismissKey]);

  // 2) Cuando cambia la ruta/tab, actualizar guía
  useEffect(() => {
    const next = getGuideMessage(ctx);
    setMsg(next);

    const prev = safeLocalStorageGet(lastCtxKey);
    if (prev !== String(ctx)) {
      safeLocalStorageSet(lastCtxKey, String(ctx));
      setLog((L) => {
        const compact = `${next.title}: ${next.text}`;
        const last = L[L.length - 1]?.text ?? "";
        if (last === compact) return L;
        return [...L, { from: "federalito", text: compact }];
      });

      if (open && voiceEnabled) {
        speak(`${next.title}. ${next.text}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // 3) Preparar reconocimiento de voz (si existe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const W: any = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = "es-PE";
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (ev: any) => {
      const t = ev?.results?.[0]?.[0]?.transcript ?? "";
      if (t) setUserText((prev) => (prev ? prev + " " + t : t));
    };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);

    recogRef.current = r;
  }, []);

  // ✅ PASO B: escuchar eventos externos (Home / Candidate / etc.)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<GuideEventDetail>;
      const d = ce?.detail;
      if (!d || !d.action) return;

      const speakIt = d.speak ?? true;
      const willSpeak = voiceEnabled && speakIt;

      if (d.action === "OPEN") {
        toggleOpen(true);
        return;
      }
      if (d.action === "CLOSE") {
        toggleOpen(false);
        return;
      }

      if (d.action === "SET_INPUT") {
        setUserText(d.text ?? "");
        return;
      }

      if (d.action === "USER") {
        const t = (d.text ?? "").trim();
        if (!t) return;
        setLog((L) => [...L, { from: "user", text: t }]);
        return;
      }

      if (d.action === "SAY" || d.action === "SAY_AND_OPEN") {
        const t = (d.text ?? "").trim();
        if (!t) return;

        // ✅ Mostrar el mensaje arriba (no solo en el log)
        setMsg({ title: "Guía rápida", text: t });

        // ✅ Guardar en log
        setLog((L) => [...L, { from: "federalito", text: t }]);

        if (d.action === "SAY_AND_OPEN") {
          // abrir primero y hablar después (más confiable)
          toggleOpen(true);
          if (willSpeak) {
            setTimeout(() => speak(t), 120);
          }
          return;
        }

        // SAY normal: solo habla si el panel está abierto
        if (open && willSpeak) speak(t);
        return;
      }
    };

    window.addEventListener("votoclaro:guide", handler as any);
    return () => window.removeEventListener("votoclaro:guide", handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voiceEnabled]);

  function toggleListening() {
    const r = recogRef.current;
    if (!r) return;

    if (isListening) {
      try {
        r.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    try {
      setIsListening(true);
      r.start();
    } catch {
      setIsListening(false);
    }
  }

  function ruleBasedAnswer(input: string): string {
    const t = (input || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");

    if (t.includes("como") && t.includes("buscar")) {
      return "En Inicio, escribe al menos 2 letras del nombre. Luego haz clic en el candidato para abrir su ficha.";
    }
    if (t.includes("plan") || t.includes("propuesta")) {
      return "En la pestaña PLAN, la app lee el PDF del plan y busca fragmentos relevantes por tema. Si no hay evidencia, lo dirá.";
    }
    if (t.includes("hoja") || t.includes("vida") || t.includes("hv")) {
      return "En HV verás la Hoja de Vida. Si el PDF no existe para ese candidato, aparecerá como no disponible.";
    }
    if (t.includes("compar") || t.includes("versus") || t.includes("vs")) {
      return "En COMPARE puedes contrastar dos candidatos por tema. La comparación solo usa lo encontrado en PDFs.";
    }
    if (t.includes("econom") || t.includes("emple")) {
      return "Para Economía y Empleo, entra a PLAN y selecciona el eje ECO. Ahí verás texto y páginas con evidencia.";
    }
    if (t.includes("segur") || t.includes("delinc")) {
      return "Para Seguridad, entra a PLAN y usa el eje SEG. Te mostraremos evidencia por páginas.";
    }

    const g = getGuideMessage(ctx);
    return `Estoy en modo guía (sin IA). En esta sección: ${g.title}. ${g.text}`;
    // Nota: este fallback respeta el contexto actual.
  }

  function send() {
    const trimmed = userText.trim();
    if (!trimmed) return;

    setLog((L) => [...L, { from: "user", text: trimmed }]);
    setUserText("");

    const ans = ruleBasedAnswer(trimmed);
    setLog((L) => [...L, { from: "federalito", text: ans }]);
    setMsg({ title: "Respuesta (guía)", text: ans });

    speak(ans);
  }

  if (!open) {
    return (
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 80 }}>
        <button
          type="button"
          onClick={() => toggleOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "white",
            border: "1px solid rgba(0,0,0,.12)",
            borderRadius: 999,
            padding: "10px 12px",
            boxShadow: "0 10px 25px rgba(0,0,0,.12)",
            cursor: "pointer",
          }}
          aria-label="Abrir Federalito"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/federalito.png"
            alt=""
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              objectFit: "cover",
              background: "#eee",
              flexShrink: 0,
            }}
          />
          <div style={{ textAlign: "left", lineHeight: "14px" }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Federalito</div>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,.6)" }}>Guía</div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes fed-mouth {
          0% { transform: scaleY(0.25); opacity: .55; }
          50% { transform: scaleY(1); opacity: .95; }
          100% { transform: scaleY(0.25); opacity: .55; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 80,
          width: "min(420px, calc(100vw - 32px))",
          background: "white",
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 18,
          boxShadow: "0 18px 60px rgba(0,0,0,.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: 12,
            alignItems: "center",
            borderBottom: "1px solid rgba(0,0,0,.08)",
            background: "linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,0))",
          }}
        >
          <div style={{ position: "relative", width: 54, height: 54, flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={isSpeaking && gifOk ? "/federalito_talk.gif" : "/federalito.png"}
              alt="Federalito"
              onError={() => setGifOk(false)}
              style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                objectFit: "cover",
                background: "#eee",
                display: "block",
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 18,
                bottom: 12,
                width: 18,
                height: 7,
                borderRadius: 999,
                background: "rgba(0,0,0,.55)",
                transformOrigin: "center",
                animation: isSpeaking ? "fed-mouth 220ms infinite" : "none",
                opacity: gifOk ? 0 : 1,
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Federalito (Guía)</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,.65)" }}>
              {msg.title} · {ctx}
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleOpen(false)}
            aria-label="Cerrar"
            style={{
              border: "1px solid rgba(0,0,0,.12)",
              background: "white",
              borderRadius: 10,
              width: 34,
              height: 34,
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 12 }}>
          <div
            style={{
              fontSize: 13,
              lineHeight: "18px",
              color: "rgba(0,0,0,.82)",
              background: "rgba(0,0,0,.03)",
              border: "1px solid rgba(0,0,0,.06)",
              borderRadius: 14,
              padding: 10,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{msg.title}</div>
            <div>{msg.text}</div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => speak(`${msg.title}. ${msg.text}`)}
                style={{
                  border: "1px solid rgba(0,0,0,.12)",
                  background: "white",
                  borderRadius: 10,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                ▶︎ Leer
              </button>

              <button
                type="button"
                onClick={() => stopSpeak()}
                style={{
                  border: "1px solid rgba(0,0,0,.12)",
                  background: "white",
                  borderRadius: 10,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                ⏹ Detener
              </button>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(0,0,0,.12)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "white",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
                title="Activa/desactiva voz"
              >
                <input type="checkbox" checked={voiceEnabled} onChange={(e) => setVoiceEnabled(e.target.checked)} />
                Voz
              </label>
            </div>
          </div>

          {/* Conversación */}
          <div
            style={{
              marginTop: 10,
              border: "1px solid rgba(0,0,0,.08)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "8px 10px",
                background: "rgba(0,0,0,.02)",
                borderBottom: "1px solid rgba(0,0,0,.08)",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Pregúntame (modo guía, sin IA)
            </div>

            <div style={{ maxHeight: 150, overflow: "auto", padding: 10, fontSize: 12 }}>
              {log.length === 0 ? (
                <div style={{ color: "rgba(0,0,0,.55)" }}>
                  Tip: pregunta “¿cómo comparo economía?” o “¿dónde veo hoja de vida?”
                </div>
              ) : (
                log.slice(-10).map((m, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 8,
                      display: "flex",
                      justifyContent: m.from === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "88%",
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: m.from === "user" ? "rgba(0,0,0,.08)" : "rgba(0,0,0,.03)",
                        border: "1px solid rgba(0,0,0,.06)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <b style={{ opacity: 0.8 }}>{m.from === "user" ? "Tú" : "Federalito"}:</b>{" "}
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid rgba(0,0,0,.08)" }}>
              <input
                value={userText}
                onChange={(e) => setUserText(e.target.value)}
                placeholder="Escribe aquí…"
                style={{
                  flex: 1,
                  border: "1px solid rgba(0,0,0,.12)",
                  borderRadius: 10,
                  padding: "10px 10px",
                  fontSize: 12,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
              />

              <button
                type="button"
                onClick={toggleListening}
                title={
                  recogRef.current
                    ? isListening
                      ? "Detener micrófono"
                      : "Hablar (micrófono)"
                    : "Tu navegador no soporta SpeechRecognition"
                }
                disabled={!recogRef.current}
                style={{
                  border: "1px solid rgba(0,0,0,.12)",
                  background: recogRef.current ? "white" : "rgba(0,0,0,.03)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: recogRef.current ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {isListening ? "🎙️…" : "🎙️"}
              </button>

              <button
                type="button"
                onClick={send}
                style={{
                  border: "none",
                  background: "black",
                  color: "white",
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                Enviar
              </button>
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(0,0,0,.55)" }}>
            Nota: si quieres “gif hablando”, coloca <b>/public/federalito_talk.gif</b>. Si no existe, se usa{" "}
            <b>boca animada</b> automáticamente.
          </div>
        </div>
      </div>
    </>
  );
}
