"use client";

import { useMemo, useState } from "react";

type Mode = "STRICT" | "SUMMARY";

export default function PartyDocsBlock(props: { partyId?: string }) {
  const partyId = props.partyId ?? "perufederal";
  const [mode, setMode] = useState<Mode>("SUMMARY");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [ans, setAns] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const canAsk = useMemo(() => q.trim().length >= 4, [q]);

  async function ask() {
    setErr("");
    setAns("");
    setLoading(true);
    try {
      const r = await fetch("/api/party/docs/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, mode, question: q }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error");
      setAns(j.answer || "");
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Misma línea visual PRO de /cambio-con-valentia
  const innerCard = "rounded-2xl border-2 border-red-600 bg-white/80 p-4";
  const btnGreen =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border border-red-500 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const selectWarm =
    "rounded-xl border border-red-500 bg-white px-3 py-2 text-sm font-extrabold text-slate-900 " +
    "shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-600";

  return (
    <div className={innerCard}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-slate-700 font-extrabold tracking-wide uppercase">
            Documentos base
          </div>
          <h3 className="mt-1 text-base md:text-lg font-extrabold text-slate-900 break-words">
            Conversación del partido (JSON)
          </h3>
          <p className="mt-2 text-sm md:text-base text-slate-800 font-semibold leading-relaxed break-words">
            Responde de forma fluida y humana, pero siempre alineada a nuestros documentos base.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-700 font-extrabold uppercase tracking-wide">
            Modo
          </span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className={selectWarm}
            aria-label="Modo de respuesta"
          >
            <option value="SUMMARY">SUMMARY (fluido)</option>
            <option value="STRICT">STRICT (más preciso)</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3 items-start">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pregunta cualquier tema (economía, educación, seguridad, salud...)"
          className="w-full rounded-xl border border-red-500 bg-white px-4 py-3 text-sm md:text-base font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />

        <button
          type="button"
          onClick={ask}
          disabled={!canAsk || loading}
          className={btnGreen + " h-[46px] sm:h-auto"}
        >
          {loading ? "Consultando..." : "Preguntar"}
        </button>
      </div>

      {err ? (
        <div className="mt-3 rounded-xl border border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          Error: {err}
          <div className="mt-1 text-xs font-semibold text-red-700">
            Verifica que existan JSON en <code>/public/party/{partyId}/docs/</code>
          </div>
        </div>
      ) : null}

      {ans ? (
        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50/60 p-4">
          <div className="text-xs text-slate-700 font-extrabold tracking-wide uppercase">
            Respuesta
          </div>
          <div className="mt-2 text-sm md:text-base text-slate-900 font-semibold leading-relaxed whitespace-pre-wrap break-words">
            {ans}
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-slate-600 text-center font-semibold">
        Nota: Este bloque responde usando únicamente los documentos base cargados en JSON.
      </p>
    </div>
  );
}
