// src/app/candidate/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import EvidenceBadge from "@/components/ui/EvidenceBadge";
import { useSearchParams } from "next/navigation";


type CandidateProfile = {
  id: string;
  full_name: string;
  party_name: string;
  photo_url: string | null;
  hv_summary: string | null;
};

type DemoSection = "HV" | "NEWS" | "PLAN";

type Source = { title: string; url?: string; page?: number };

function Sources({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-3">
      <div className="text-sm font-medium text-slate-900">Fuentes</div>
      <ul className="mt-2 text-sm list-disc pl-5 text-slate-700">
        {sources.map((s, i) => (
          <li key={i}>
            {s.title}
            {s.page != null ? ` (p. ${s.page})` : ""}
            {s.url ? (
              <>
                {" — "}
                <a className="underline text-green-700 hover:text-green-800" href={s.url} target="_blank" rel="noreferrer">
                  abrir
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

type CompareAxis = "SEG" | "ECO" | "SAL" | "EDU";

type CompareApiResponse = {
  axis: CompareAxis;
  a: { id: string; answer: string; citations: Source[] };
  b: { id: string; answer: string; citations: Source[] };
};

type ProfilesMultiResponse = {
  profiles: Record<string, CandidateProfile | null>;
};

// ✅ Lista para selector
type CandidateLite = {
  id: string;
  full_name: string;
  party_name?: string;
};

function isPrivacyBlocked(q: string) {
  const t = q.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const sexual = ["sexual", "sexo", "intim", "amante", "infidel", "porn", "prostit", "orientacion", "gay", "lesb", "bisex", "trans"];
  const family = ["esposa", "esposo", "hijo", "hija", "familia", "novia", "novio", "pareja", "matrimonio", "divorcio", "padre", "madre", "hermano", "hermana"];
  return sexual.some((k) => t.includes(k)) || family.some((k) => t.includes(k));
}

function MiniProfileHeader({ title, profile }: { title: string; profile: CandidateProfile | null | undefined }) {
  const name = profile?.full_name ?? title;
  const party = profile?.party_name ?? "";
  const photo = profile?.photo_url ?? null;

  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-200 shrink-0 border border-slate-100">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={name} className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate text-slate-900">{name}</div>
        {party ? <div className="text-xs text-slate-600 truncate">{party}</div> : null}
      </div>
    </div>
  );
}

type AiAnswerResponse = {
  ok: boolean;
  id: string;
  doc: "plan" | "hv";
  answer: string;
  citations: Source[];
  error?: string;
  debug?: any;
};

async function safeReadJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const text = await res.text();
  return { _nonJson: true, text: text.slice(0, 5000) };
}

function toUserFriendlyAiError(payload: any) {
  const msg = String(payload?.error ?? payload?.message ?? "").trim();

  if (!msg) return "Error IA: respuesta inválida del servidor.";

  const norm = msg.toLowerCase();
  if (norm.includes("gemini") && (norm.includes("api key") || norm.includes("key") || norm.includes("unauthorized") || norm.includes("401"))) {
    return "Error IA: falta o es inválida GEMINI_API_KEY en .env.local. Colócala y reinicia `npm run dev`.";
  }
  if (norm.includes("quota") || norm.includes("rate") || norm.includes("limit")) {
    return "Error IA: cuota/límite alcanzado. Intenta de nuevo en unos minutos o revisa tu cuota en AI Studio.";
  }

  return `Error IA: ${msg}`;
}

// ✅ Helper: decidir badge según evidencia real (citations) o “no evidencia”
function getEvidenceKind(answer: string, citations: Source[]) {
  const hasCitations = Array.isArray(citations) && citations.length > 0;
  const a = (answer || "").toLowerCase();
  const saysNoEvidence = a.includes("no hay evidencia");
  if (hasCitations && !saysNoEvidence) return "WITH_EVIDENCE" as const;
  return "NO_EVIDENCE" as const;
}

// ✅ Respuesta esperada de /api/web/ask
type WebAskCitation = { source: number; url: string; quote: string };
type WebAskSource = { source: number; title: string; url: string; domain: string };
type WebAskResponse = {
  q: string;
  answer: string;
  citations?: WebAskCitation[];
  sources?: WebAskSource[];
  gemini_enabled?: boolean;
  rule?: string;
  debug?: any;
};

// ✅ fallback: convierte slug id → “texto humano”
function slugToName(slug: string) {
  return (slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
// ✅ Ajuste SOLO para pronunciación (NO afecta datos ni lógica)
function nameForSpeech(name: string) {
  return name
    .replace(/\bJoaquin\b/gi, "Joaquín")
    .replace(/\bJose\b/gi, "José")
    .replace(/\bMaria\b/gi, "María")
    .replace(/\bAndres\b/gi, "Andrés")
    .replace(/\bRene\b/gi, "René")
    .replace(/\bAngel\b/gi, "Ángel")

    // agrega aquí los que te fallen:
    .replace(/\bSofia\b/gi, "Sofía")
    .replace(/\bMasse\b/gi, "Massé")
    .replace(/\bValentia\b/gi, "Valentía");
}

// ✅ Hablar SIN abrir el panel (regla PRO)
function guideSayNoOpen(text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: { action: "SAY", text, speak: true },
    })
  );
}

export default function CandidatePage() {
  const [id, setId] = useState<string>("");
  const [tab, setTab] = useState<DemoSection>("HV");

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("—");
  const [citations, setCitations] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);

  // ✅ Comparación
  const [compareWith, setCompareWith] = useState<string>("");
  const [compareAxis, setCompareAxis] = useState<CompareAxis>("ECO");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareApiResponse | null>(null);

  const [compareProfiles, setCompareProfiles] = useState<Record<string, CandidateProfile | null>>({});

  // ✅ Lista completa (desde /api/candidates/index)
  const [allCandidates, setAllCandidates] = useState<CandidateLite[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  // ✅ Para no repetir lectura en re-renders
  const lastGuideKeyRef = useRef<string>("");

  useEffect(() => {
    const path = window.location.pathname;
    const parts = path.split("/").filter(Boolean);
   const rawId = parts[1] ?? "";
setId(rawId ? decodeURIComponent(rawId) : "");

    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    const normalized: DemoSection = t === "NEWS" ? "NEWS" : t === "PLAN" ? "PLAN" : "HV";
    setTab(normalized);
  }, []);

  // ✅ Carga lista completa SOLO desde /api/candidates/index
  // ✅ CAMBIO: cuando estamos en PLAN, pedimos SOLO candidatos con plan para ocultar el resto
  useEffect(() => {
    let aborted = false;

    async function loadCandidates() {
      if (!id) return;
      if (tab !== "PLAN") return;

      setLoadingCandidates(true);
      try {
        const res = await fetch("/api/candidates/index?onlyWithPlan=1", { cache: "no-store" });
        const data = await res.json();

        const arr: any[] = Array.isArray(data?.candidates) ? data.candidates : [];
        const normalized: CandidateLite[] = arr
          .map((c: any) => ({
            id: String(c?.id ?? "").trim(),
            full_name: String(c?.full_name ?? "").trim(),
            party_name: c?.party_name ? String(c.party_name).trim() : undefined,
          }))
          .filter((c) => c.id && c.full_name);

        if (aborted) return;

        normalized.sort((a, b) => a.full_name.localeCompare(b.full_name, "es", { sensitivity: "base" }));
        setAllCandidates(normalized);

       // 🔑 candidato preferido por defecto
const preferredName = "armando joaquin masse fernandez";

// buscar primero a Armando Massé
const preferred = normalized.find(
  (c) =>
    c.id !== id &&
    c.full_name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .includes(preferredName)
);

// fallback: primer candidato distinto al actual
const firstOther = normalized.find((c) => c.id !== id);

if (!compareWith || compareWith === id) {
  if (preferred) {
    setCompareWith(preferred.id);
  } else if (firstOther) {
    setCompareWith(firstOther.id);
  }
} else {
  const exists = normalized.some((c) => c.id === compareWith);
  if (!exists) {
    if (preferred) {
      setCompareWith(preferred.id);
    } else if (firstOther) {
      setCompareWith(firstOther.id);
    }
  }
}

      } finally {
        if (!aborted) setLoadingCandidates(false);
      }
    }

    loadCandidates();
    return () => {
      aborted = true;
    };
  }, [id, tab]);

  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!id) return;
      setLoadingProfile(true);
      try {
        const res = await fetch(`/api/candidates/profile?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!aborted) setProfile(data.profile ?? null);
      } finally {
        if (!aborted) setLoadingProfile(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [id]);
  // ✅ Guía automática por pestaña (SIN abrir panel)
  useEffect(() => {
    if (!id) return;
    if (loadingProfile) return;

    const rawName = (profile?.full_name ?? "").trim() || slugToName(id);
const name = nameForSpeech(rawName);

    const key = `${id}::${tab}`;

    // evitar repetir si React re-renderiza
    if (lastGuideKeyRef.current === key) return;
    lastGuideKeyRef.current = key;

    const common =
      `Estás en la ficha de ${name}. ` +
      "Aquí tienes tres pestañas: Hoja de vida, Actuar político, y Plan de gobierno. ";

    const text =
      tab === "HV"
        ? common +
          "Ahora estás en Hoja de vida. Aquí puedes hacer preguntas y la respuesta se basa solo en el PDF de la Hoja de Vida, con páginas como evidencia. Si no hay evidencia en el PDF, te lo diré."
        : tab === "NEWS"
        ? common +
          "Ahora estás en Actuar político. Aquí se consultan fuentes web confiables y se muestran enlaces. Si no hay evidencia suficiente, se indica explícitamente."
        : common +
          "Ahora estás en Plan de gobierno. Aquí puedes hacer preguntas y la respuesta se basa solo en el PDF del Plan de Gobierno, con páginas como evidencia. Si el dato no está en el PDF, se indicará que no hay evidencia suficiente.";

    guideSayNoOpen(text);
  }, [id, tab, loadingProfile, profile?.full_name]);

  const demo = useMemo(() => {
    return {
      HV: {
        title: "Hoja de vida (JNE)",
        helper:
          "Modo IA (real): responde leyendo la Hoja de Vida (PDF). Si el dato no está en el PDF, se responde: “No hay evidencia suficiente…”.",
        suggested: ["¿Qué experiencia laboral declara?", "¿Qué formación académica declara?", "¿Tiene sentencias registradas?"],
      },
      NEWS: {
        title: "Actuar político (con fuentes)",
        helper: "Modo WEB (real): busca en fuentes confiables (lista blanca) y responde SOLO si hay evidencia. Siempre muestra links.",
        suggested: [
          "Resume 3 hechos verificables con fuentes.",
          "¿Qué controversias aparecen en medios confiables? (con enlace)",
          "¿Hay investigaciones o procesos mencionados en medios? (con enlace)",
        ],
      },
      PLAN: {
        title: "Plan de gobierno",
        helper:
          "Modo IA (real): responde leyendo el Plan de Gobierno (PDF). Si el dato no está en el PDF, se responde: “No hay evidencia suficiente…”.",
        suggested: ["¿Qué propone sobre seguridad ciudadana?", "¿Qué propone en economía y empleo?", "¿Qué propone en salud y educación?"],
      },
    } satisfies Record<DemoSection, { title: string; helper: string; suggested: string[] }>;
  }, []);

  useEffect(() => {
    setQuestion("");
    setAnswer("—");
    setCitations([]);
    setBusy(false);
    setCompareResult(null);
    setCompareLoading(false);
    setCompareProfiles({});
  }, [tab]);

  async function consult() {
    const q = question.trim();

    if (isPrivacyBlocked(q)) {
      setAnswer("Consulta bloqueada: tema de vida privada no pertinente a evaluación política en VotoClaro.");
      setCitations([]);
      return;
    }

    if (!q) {
      setAnswer("Escribe una pregunta para consultar.");
      setCitations([]);
      return;
    }
    if (!id) {
      setAnswer("No se pudo detectar el candidato (id). Vuelve y entra otra vez desde el buscador.");
      setCitations([]);
      return;
    }

    // ✅ HV y PLAN ahora van a IA (Gemini) vía /api/ai/answer
    if (tab === "HV" || tab === "PLAN") {
      setBusy(true);
      setAnswer(tab === "HV" ? "Consultando Hoja de Vida con IA (PDF)…" : "Consultando Plan de Gobierno con IA (PDF)…");
      setCitations([]);

      try {
        const doc = tab === "HV" ? "hv" : "plan";

        const res = await fetch("/api/ai/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ id, doc, question: q }),
        });

        const payload = await safeReadJson(res);

        if (!res.ok) {
          if ((payload as any)?._nonJson) {
            setAnswer(
              "Error IA: el servidor devolvió una respuesta no-JSON (posible error 500/404). " +
                "Abre DevTools → Network → /api/ai/answer y pega aquí el response."
            );
            setCitations([]);
            return;
          }
          setAnswer(toUserFriendlyAiError(payload));
          setCitations([]);
          return;
        }

        const data = payload as AiAnswerResponse;

        if (!data?.ok) {
          setAnswer(toUserFriendlyAiError(data));
          setCitations([]);
          return;
        }

        setAnswer(data.answer || "No hay evidencia suficiente en las fuentes consultadas.");
        setCitations(Array.isArray(data.citations) ? data.citations : []);
      } catch (e: any) {
        setAnswer(`Error IA: ${(e?.message ?? "desconocido").toString()}`);
        setCitations([]);
      } finally {
        setBusy(false);
      }
      return;
    }
function buildActuarAnswer(file: any, rawQ: string) {
  const items = Array.isArray(file?.items) ? file.items : [];
  if (!items.length) {
    return (
      "En el archivo local de Actuar Político de este candidato no tengo registros.\n\n" +
      "Para ampliar, puedes buscar más noticias en Internet en fuentes confiables."
    );
  }

  const q = (rawQ || "").toLowerCase();

  // Resumen rápido
  if (q.includes("resumen")) {
    const top = items
      .filter((x: any) => !!x?.date)
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 3);

    return (
      `Resumen de Actuar Político — ${file?.candidate_full_name || "Candidato"}\n` +
      `Registros: ${items.length}\n\n` +
      (top.length
        ? top
            .map(
              (it: any) =>
                `• ${it.date} — ${it.title}\n  Fuente: ${it?.source?.name} (${it?.source?.domain})\n  Link: ${it.url}`
            )
            .join("\n\n")
        : "No hay ítems con fecha.")
    );
  }

  // Búsqueda por palabra (título/snippet/topic)
  const hits = items.filter((it: any) => {
    const hay = `${it?.title || ""} ${it?.snippet || ""} ${it?.topic || ""}`.toLowerCase();
    return q.length >= 3 && hay.includes(q);
  });

  const show = (hits.length ? hits : items)
    .sort((a: any, b: any) => String(b?.date || "").localeCompare(String(a?.date || "")))
    .slice(0, 6);

  if (!show.length) {
    return (
      "En el archivo local de Actuar Político de este candidato no tengo un registro sobre ese tema.\n\n" +
      "Para ampliar, puedes buscar más noticias en Internet en fuentes confiables."
    );
  }

  return (
    `Actuar Político — ${file?.candidate_full_name || "Candidato"}\n\n` +
    show
      .map(
        (it: any) =>
          `• ${it?.date || "sin fecha"} — ${it?.title}\n  Fuente: ${it?.source?.name} (${it?.source?.domain})\n  Link: ${it?.url}\n  Nota: ${it?.snippet}`
      )
      .join("\n\n")
  );
}
// ===== Actuar Político: lector de JSON local =====


// ✅ NEWS (Actuar político) ahora es LOCAL: JSON en /public/actuar
if (tab === "NEWS") {
  setBusy(true);
  setAnswer("Consultando archivo local (JSON)…");
  setCitations([]);

  try {
    const url = `/actuar/${encodeURIComponent(id)}.json`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      setAnswer(
        "No encontré el archivo local de Actuar Político para este candidato.\n\n" +
          `Archivo esperado: ${url}\n\n` +
          "Si este tema no está registrado aquí, puedes buscar más noticias en Internet en fuentes confiables."
      );
      setCitations([]);
      return;
    }

    const file: any = await res.json();

    // ✅ Respuesta usando SOLO el JSON local
    const out = buildActuarAnswer(file, q);
    setAnswer(out);

// ✅ Mostrar “Fuentes” como lista clickeable en la UI (cuando existan)
const items = Array.isArray(file?.items) ? file.items : [];

const entries: Array<[string, Source]> = items
  .filter((it: any) => typeof it?.url === "string" && !!it?.source?.name)
  .map((it: any) => [
    it.url as string,
    {
      title: `${it.source.name}${it.source.domain ? ` (${it.source.domain})` : ""}`,
      url: it.url as string,
    },
  ]);

const mappedSources = Array.from(new Map<string, Source>(entries).values()).slice(0, 10);

setCitations(mappedSources);

  } catch (e: any) {
    setAnswer(
      "No pude leer el archivo local de Actuar Político.\n\n" +
        "Si este tema no está registrado aquí, puedes buscar más noticias en Internet en fuentes confiables."
    );
    setCitations([]);
  } finally {
    setBusy(false);
  }
  return;
}


    setAnswer("Pestaña no soportada.");
    setCitations([]);
  }

  async function runComparePlan() {
    if (!id) {
      setCompareResult(null);
      return;
    }
    if (!compareWith || compareWith === id) {
      setCompareResult(null);
      return;
    }

    setCompareLoading(true);
    setCompareResult(null);
    setCompareProfiles({});

    try {
      const url =
        `/api/compare/plan?idA=${encodeURIComponent(id)}` +
        `&idB=${encodeURIComponent(compareWith)}` +
        `&axis=${encodeURIComponent(compareAxis)}`;

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setCompareResult(null);
        return;
      }

      const compareData = data as CompareApiResponse;
      setCompareResult(compareData);
      // ✅ Enviar la comparación al asistente para que pueda leerla con el botón 🔊
try {
  const axisLabel =
    compareData.axis === "SEG"
      ? "Seguridad"
      : compareData.axis === "ECO"
      ? "Economía y empleo"
      : compareData.axis === "SAL"
      ? "Salud"
      : "Educación";

  const aName = (compareProfiles?.[compareData.a.id]?.full_name || profile?.full_name || slugToName(compareData.a.id)).trim();
  const bName = (compareProfiles?.[compareData.b.id]?.full_name || slugToName(compareData.b.id)).trim();

  const textToRead =
    `Comparación Plan vs Plan — Eje: ${axisLabel}.\n\n` +
    `Candidato A: ${aName}.\n` +
    `${compareData.a.answer}\n\n` +
    `Candidato B: ${bName}.\n` +
    `${compareData.b.answer}`;

  window.dispatchEvent(
    new CustomEvent("votoclaro:page-read", {
      detail: { text: textToRead },
    })
  );
} catch {}

      const ids = `${compareData.a.id},${compareData.b.id}`;
      const pr = await fetch(`/api/candidates/profile?ids=${encodeURIComponent(ids)}`, { cache: "no-store" });
      const prData = (await pr.json()) as ProfilesMultiResponse;

      if (pr.ok && prData?.profiles) setCompareProfiles(prData.profiles);
    } finally {
      setCompareLoading(false);
    }
  }
  function clearCompare() {
  setCompareResult(null);
  setCompareLoading(false);
  setCompareProfiles({});

  // opcional: dejar el eje en ECO (o no tocarlo)
  // setCompareAxis("ECO");

  // opcional: limpiar el candidato B (o mantenerlo)
  // setCompareWith("");

  // ✅ limpiar parámetros de URL (idB y axis)
  try {
    const params = new URLSearchParams(window.location.search);
    params.delete("idB");
    params.delete("axis");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  } catch {}
}

  const active = demo[tab];
  const aProfile = compareResult ? compareProfiles[compareResult.a.id] : null;
  const bProfile = compareResult ? compareProfiles[compareResult.b.id] : null;

  const compareOptions: CandidateLite[] = allCandidates.length > 0 ? allCandidates.filter((c) => c.id !== id) : [];

  const answerKind = getEvidenceKind(answer, citations);
    // ✅ Chips “cálidos” (preguntas sugeridas / ejes) con estado seleccionado
  const chipBase =
    "group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium " +
    "border transition-all duration-200 select-none " +
    "hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.99] " +
    "focus:outline-none focus:ring-2 focus:ring-green-200";

  const chipIdle =
    "border-green-200 bg-green-50/70 text-slate-800 " +
    "hover:bg-green-100 hover:border-green-300";

  const chipActive =
    "border-green-800 bg-gradient-to-r from-green-600 to-green-700 text-white " +
    "shadow-md";

  function ChipBtn(props: { text: string; icon?: string; onClick: () => void }) {
    const active = question.trim() === props.text.trim();
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={`${chipBase} ${active ? chipActive : chipIdle}`}
        aria-pressed={active}
        title={props.text}
      >
        <span className={`${active ? "opacity-100" : "opacity-80"} text-[13px] leading-none`}>
          {props.icon ?? "💡"}
        </span>
        <span className="whitespace-nowrap">{props.text}</span>

        {/* ✅ micro “shine” en hover (solo visual) */}
        <span
          className={
            "pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 " +
            (active ? "" : "")
          }
        />
      </button>
    );
  }

  // ✅ estilos (opción 1)
  const tabBase = "border rounded-xl px-4 py-2 text-sm font-semibold transition";
  const tabOn = "bg-green-700 text-white border-green-700 shadow-sm";
  const tabOff = "bg-white text-slate-800 border-slate-200 hover:border-green-300 hover:bg-green-50";

   // ✅ Botón principal: “invita a clic”
  // - hover: sube un poquito + crece leve
  // - active: baja + reduce leve
  // - shine: brillo diagonal
  // - pulse: pulso sutil (solo este)
  const btnPrimary =
    "group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white " +
    "border border-green-800 bg-gradient-to-r from-green-600 to-green-700 " +
    "shadow-md transition-all duration-200 " +
    "hover:from-green-700 hover:to-green-800 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01] " +
    "active:translate-y-0 active:scale-[0.99] " +
    "focus:outline-none focus:ring-2 focus:ring-green-200 " +
    "disabled:opacity-60 disabled:cursor-not-allowed " +
    "motion-safe:animate-[pulse_2.2s_ease-in-out_infinite] " +
    "overflow-hidden";

  // ✅ Shine (brillo) usando pseudo-elemento via Tailwind arbitrary
  // (se activa en hover)
  const btnPrimaryShine =
    "after:content-[''] after:absolute after:inset-0 after:-translate-x-[120%] after:skew-x-[-20deg] " +
    "after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent " +
    "after:transition-transform after:duration-500 " +
    "group-hover:after:translate-x-[120%]";

  // ✅ Botón secundario: elegante, también “clickeable” pero sin pulso
  const btnSecondary =
    "group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold " +
    "border border-green-600 bg-white text-green-700 " +
    "shadow-sm transition-all duration-200 " +
    "hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 " +
    "active:translate-y-0 active:scale-[0.99] " +
    "focus:outline-none focus:ring-2 focus:ring-green-200 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  // ✅ Pills (preguntas sugeridas) con “rebote” suave al hover
  const pill =
    "inline-flex items-center border border-green-200 bg-white text-slate-800 " +
    "rounded-full px-3 py-1 text-sm transition-all duration-150 " +
    "hover:bg-green-50 hover:border-green-300 hover:-translate-y-0.5 hover:shadow-sm " +
    "active:translate-y-0 active:scale-[0.99]";
    const searchParams = useSearchParams();
    const fromCambio = searchParams.get("from") === "cambio";

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto bg-gradient-to-b from-green-50 via-white to-white">
     <a
  href="/"
  className="inline-flex items-center rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition"
>
  ← Volver a inicio
</a>

{fromCambio ? (
  <a
    href="/cambio-con-valentia"
    className="inline-flex items-center gap-2 mt-2 ml-6 rounded-xl px-4 py-2 border border-green-800 bg-green-700 text-white text-sm font-extrabold hover:bg-green-800 shadow-sm transition"
  >
    ← Un Cambio con Valentía
  </a>
) : null}


      {/* Header candidato */}
      <div className="mt-4 border border-slate-200 bg-white rounded-2xl p-5 flex gap-4 items-start shadow-md">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-100">
          {profile?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.photo_url} alt={profile.full_name} className="w-full h-full object-cover" />
          ) : null}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xl font-semibold text-slate-900">{loadingProfile ? "Cargando..." : profile?.full_name ?? "Candidato"}</div>
            <EvidenceBadge kind="GUIDE" />
            <EvidenceBadge kind="WITH_EVIDENCE" />
            <EvidenceBadge kind="NO_EVIDENCE" />
          </div>

          <div className="text-sm text-slate-600">{profile?.party_name ?? ""}</div>
          <p className="text-sm mt-2 text-slate-700">{profile?.hv_summary ?? ""}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2 flex-wrap">
        <a className={`${tabBase} ${tab === "HV" ? tabOn : tabOff}`} href={`/candidate/${id}?tab=HV`}>
          Hoja de vida
        </a>
        <a className={`${tabBase} ${tab === "NEWS" ? tabOn : tabOff}`} href={`/candidate/${id}?tab=NEWS`}>
          Actuar político
        </a>
        <a className={`${tabBase} ${tab === "PLAN" ? tabOn : tabOff}`} href={`/candidate/${id}?tab=PLAN`}>
          Plan de gobierno
        </a>
      </div>

      {/* Panel principal */}
      <div className="mt-4 border border-slate-200 bg-white rounded-2xl p-5 shadow-md">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-lg font-semibold text-slate-900">{active.title}</div>
          {tab === "NEWS" ? <EvidenceBadge kind="GUIDE" /> : <EvidenceBadge kind="WITH_EVIDENCE" />}
        </div>

        <p className="mt-2 text-sm text-slate-700">{active.helper}</p>

        <div className="mt-4">
          <div className="text-sm font-medium text-slate-900">Preguntas sugeridas</div>
         <div className="mt-2 flex flex-wrap gap-2">
  {active.suggested.map((s) => (
    <ChipBtn
      key={s}
      text={s}
      icon={tab === "PLAN" ? "📄" : tab === "HV" ? "🧾" : "📰"}
      onClick={() => setQuestion(s)}
    />
  ))}
</div>
        </div>

        {tab === "PLAN" && (
          <div className="mt-6">
            <div className="text-sm font-medium text-slate-900">Resumen por ejes (Plan de Gobierno)</div>

            <div className="mt-2 flex flex-wrap gap-2">
  <ChipBtn
    text="Resume las propuestas sobre seguridad ciudadana."
    icon="🛡️"
    onClick={() => setQuestion("Resume las propuestas sobre seguridad ciudadana.")}
  />
  <ChipBtn
    text="Resume las propuestas sobre economía y empleo."
    icon="💼"
    onClick={() => setQuestion("Resume las propuestas sobre economía y empleo.")}
  />
  <ChipBtn
    text="Resume las propuestas sobre salud."
    icon="🩺"
    onClick={() => setQuestion("Resume las propuestas sobre salud.")}
  />
  <ChipBtn
    text="Resume las propuestas sobre educación."
    icon="🎓"
    onClick={() => setQuestion("Resume las propuestas sobre educación.")}
  />
</div>

            <p className="mt-2 text-xs text-slate-500">
              Este resumen se genera únicamente a partir del Plan de Gobierno (PDF) y siempre cita páginas. Si no hay evidencia, se indicará explícitamente.
            </p>
          </div>
        )}

        {tab === "PLAN" && (
          <div className="mt-6 border border-green-100 bg-green-50/40 rounded-2xl p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-semibold text-slate-900">Comparar 2 candidatos (Plan vs Plan)</div>
              <EvidenceBadge kind="WITH_EVIDENCE" />
            </div>

            <p className="mt-1 text-xs text-slate-600">Comparación basada solo en PDFs. Si no hay evidencia en un plan, se indica explícitamente.</p>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-700">Comparar con</div>

                <select
                  className="mt-1 w-full border border-green-200 rounded-xl p-2 bg-white text-slate-900 appearance-none pr-10 focus:outline-none focus:ring-2 focus:ring-green-200 bg-[length:18px_18px] bg-no-repeat bg-[right_0.75rem_center] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%230f172a%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%200%1%201.06.02L10%2010.94l3.71-3.71a.75.75%200%200%1%201.08%201.04l-4.25%204.25a.75.75%200%200%1-1.06%200L5.21%208.27a.75.75%200%200%1%200-1.06z%22%20clip-rule%3D%22evenodd%22/%3E%3C/svg%3E')]"
                  value={compareWith}
                  onChange={(e) => {
  const v = e.target.value;
  setCompareWith(v);

  // 🔑 guardar idB en la URL
  const params = new URLSearchParams(window.location.search);
  params.set("idB", v);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${params.toString()}`
  );
}}

                >
                  {loadingCandidates ? <option value={compareWith || ""}>Cargando...</option> : null}

                  {compareOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                      {c.party_name ? ` — ${c.party_name}` : ""}
                    </option>
                  ))}
                </select>

                {!loadingCandidates && allCandidates.length === 0 ? (
                  <div className="mt-1 text-[11px] text-red-700">No se pudo cargar /api/candidates/index. Revisa consola/network.</div>
                ) : null}
              </div>

              <div>
                <div className="text-xs font-medium text-slate-700">Eje</div>
                <select
                 className="mt-1 w-full border border-green-200 rounded-xl p-2 bg-white text-slate-900 appearance-none pr-10 focus:outline-none focus:ring-2 focus:ring-green-200 bg-[length:18px_18px] bg-no-repeat bg-[right_0.75rem_center] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%230f172a%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%200%1%201.06.02L10%2010.94l3.71-3.71a.75.75%200%200%1%201.08%201.04l-4.25%204.25a.75.75%200%200%1-1.06%200L5.21%208.27a.75.75%200%200%1%200-1.06z%22%20clip-rule%3D%22evenodd%22/%3E%3C/svg%3E')]"
                  value={compareAxis}
                  onChange={(e) => {
  const v = e.target.value as CompareAxis;
  setCompareAxis(v);

  // 🔑 guardar axis en la URL
  const params = new URLSearchParams(window.location.search);
  params.set("axis", v);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${params.toString()}`
  );
}}

                >
                  <option value="SEG">Seguridad</option>
                  <option value="ECO">Economía y empleo</option>
                  <option value="SAL">Salud</option>
                  <option value="EDU">Educación</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
  <button
    onClick={runComparePlan}
    disabled={compareLoading || !id || !compareWith || compareWith === id}
    className={`flex-1 ${btnPrimary} ${btnPrimaryShine}`}
  >
    {compareLoading ? "Comparando..." : "Generar comparación"}
  </button>

  <button
    type="button"
    onClick={clearCompare}
    className={btnSecondary}
    title="Limpiar comparación"
  >
    Limpiar
  </button>
</div>

            </div>

            {compareResult ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-green-100 bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <MiniProfileHeader title="Candidato A" profile={aProfile} />
                    <EvidenceBadge
                      kind={compareResult.a.citations?.length ? "WITH_EVIDENCE" : "NO_EVIDENCE"}
                      page={compareResult.a.citations?.find((s) => typeof s.page === "number")?.page}
                      size="sm"
                    />
                  </div>

                  <p className="mt-3 text-sm whitespace-pre-wrap text-slate-800">{compareResult.a.answer}</p>
                  {compareResult.a.citations?.length ? <Sources sources={compareResult.a.citations} /> : null}
                </div>

                <div className="border border-green-100 bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <MiniProfileHeader title="Candidato B" profile={bProfile} />
                    <EvidenceBadge
                      kind={compareResult.b.citations?.length ? "WITH_EVIDENCE" : "NO_EVIDENCE"}
                      page={compareResult.b.citations?.find((s) => typeof s.page === "number")?.page}
                      size="sm"
                    />
                  </div>

                  <p className="mt-3 text-sm whitespace-pre-wrap text-slate-800">{compareResult.b.answer}</p>
                  {compareResult.b.citations?.length ? <Sources sources={compareResult.b.citations} /> : null}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Pregunta */}
        <div className="mt-5">
          <div className="text-sm font-medium text-slate-900">Tu pregunta</div>
          <textarea
            className="mt-2 w-full border border-green-200 rounded-xl p-3 min-h-[90px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-200"
            placeholder="Escribe tu pregunta aquí..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <div className="mt-3 flex gap-2 flex-wrap">
            <button onClick={consult} disabled={busy} className={`${btnPrimary} ${btnPrimaryShine}`}>
              {busy ? "Consultando..." : tab === "HV" ? "Consultar (HV real)" : tab === "PLAN" ? "Consultar (PLAN real)" : "Consultar (Actuar político)"}
            </button>

            <button
              onClick={() => {
                setQuestion("");
                setAnswer("—");
                setCitations([]);
              }}
              className={btnSecondary}
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Respuesta */}
        <div className="mt-5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-medium text-slate-900">Respuesta</div>
            <EvidenceBadge kind={answerKind} page={citations.find((s) => typeof s.page === "number")?.page} size="sm" />
          </div>

          <p className="mt-2 text-sm whitespace-pre-wrap text-slate-800">{answer}</p>
          {citations.length ? <Sources sources={citations} /> : null}

          {!citations.length && answer !== "—" ? (
            <div className="mt-2 text-xs text-slate-500">
              Si no aparecen páginas o fuentes, VotoClaro lo marca como <b>“Sin evidencia”</b>.
            </div>
          ) : null}
        </div>
           </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="inline-flex items-center rounded-xl bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 transition"
        >
          ↑ Subir
        </button>
      </div>

    </main>
  );
}
