// src/app/candidate/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import EvidenceBadge from "@/components/ui/EvidenceBadge";
import { useSearchParams } from "next/navigation";
import { normalizeHvJne2026 } from "@/lib/hvNormalize";

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
      <div className="text-sm font-semibold text-slate-900">Fuentes</div>
     <ul className="mt-2 text-sm list-disc pl-5 text-slate-800 break-words [overflow-wrap:anywhere]">
        {sources.map((s, i) => (
          <li key={i} className="break-words [overflow-wrap:anywhere]">

            {s.title}
            {s.page != null ? ` (p. ${s.page})` : ""}
            {s.url ? (
              <>
                {" — "}
                <a
                  className="underline text-green-800 hover:text-green-900"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
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
  const sexual = [
    "sexual",
    "sexo",
    "intim",
    "amante",
    "infidel",
    "porn",
    "prostit",
    "orientacion",
    "gay",
    "lesb",
    "bisex",
    "trans",
  ];
  const family = [
    "esposa",
    "esposo",
    "hijo",
    "hija",
    "familia",
    "novia",
    "novio",
    "pareja",
    "matrimonio",
    "divorcio",
    "padre",
    "madre",
    "hermano",
    "hermana",
  ];
  return sexual.some((k) => t.includes(k)) || family.some((k) => t.includes(k));
}

function MiniProfileHeader({
  title,
  profile,
}: {
  title: string;
  profile: CandidateProfile | null | undefined;
}) {
  const name = profile?.full_name ?? title;
  const party = profile?.party_name ?? "";
  const photo = profile?.photo_url ?? null;

  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-200 shrink-0 border border-red-200">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={name} className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
  <div className="text-sm font-semibold text-slate-900 whitespace-normal break-words leading-snug">
    {name}
  </div>

  {party ? (
    <div className="text-xs text-slate-700 whitespace-normal break-words leading-snug">
      {party}
    </div>
  ) : null}
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
  if (
    norm.includes("gemini") &&
    (norm.includes("api key") ||
      norm.includes("key") ||
      norm.includes("unauthorized") ||
      norm.includes("401"))
  ) {
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

// ✅ Respuesta esperada de /api/web/ask (se deja por compatibilidad)
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

// ✅ Fix rápido de texto con mojibake (Ã¡, Ã©, Ã±) + casos con "�"
function fixMojibake(input: any) {
  const s0 = String(input ?? "");

  // 1) Primero arreglar casos donde ya apareció el carácter reemplazo "�"
  let s = s0
    .replace(/Joaqu�n/gi, "Joaquín")
    .replace(/Mass�/gi, "Massé")
    .replace(/Fern�ndez/gi, "Fernández")
    .replace(/Rep�blica/gi, "República")
    .replace(/Per�/gi, "Perú")
    .replace(/anunci�/gi, "anunció")
    .replace(/formaliz�/gi, "formalizó")
    .replace(/inici�/gi, "inició")
    .replace(/investigaci�n/gi, "investigación")
    .replace(/Fiscal�a/gi, "Fiscalía")
    .replace(/asociaci�n/gi, "asociación")
    .replace(/regal�as/gi, "regalías")
    .replace(/pol�tica/gi, "política")
    .replace(/m�dicos/gi, "médicos")
    .replace(/acci�n/gi, "acción")
    .replace(/cient�fica/gi, "científica");

  // 2) Luego arreglar mojibake clásico SOLO si “huele” a mojibake
  if (!/[ÃÂâ€]/.test(s)) return s;

  return s
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã/g, "Í")
    .replace(/Ã“/g, "Ó")
    .replace(/Ãš/g, "Ú")
    .replace(/Ã‘/g, "Ñ")
    .replace(/Ã¼/g, "ü")
    .replace(/Ãœ/g, "Ü")
    .replace(/Â¿/g, "¿")
    .replace(/Â¡/g, "¡")
    .replace(/Â /g, " ")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€˜/g, "‘")
    .replace(/â€™/g, "’")
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—");
}

function normalizeCandidateSlug(input: string) {
  let s = String(input ?? "").trim();

  // decode %20 etc. (si viene de URL)
  try {
    s = decodeURIComponent(s);
  } catch {}

  // Normaliza unicode + quita tildes/diacríticos
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // ñ/Ñ -> n
  s = s.replace(/ñ/gi, "n");

  // minúsculas
  s = s.toLowerCase();

  // separadores comunes -> espacio
  s = s.replace(/[_/]+/g, " ");

  // quita todo excepto letras/números/espacios/guiones
  s = s.replace(/[^a-z0-9\s-]+/g, " ");

  // colapsa espacios y guiones y convierte a slug con "-"
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s/g, "-");
  s = s.replace(/-+/g, "-");

  return s;
}

// ✅ Deep fix: recorre TODO el JSON y arregla cualquier string
function deepFixMojibake(value: any): any {
  if (typeof value === "string") return fixMojibake(value);

  if (Array.isArray(value)) {
    return value.map(deepFixMojibake);
  }

  if (value && typeof value === "object") {
    const out: any = {};
    for (const k of Object.keys(value)) {
      out[k] = deepFixMojibake(value[k]);
    }
    return out;
  }

  return value;
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
                `• ${it.date} — ${fixMojibake(it.title)}\n  Fuente: ${fixMojibake(it?.source?.name)} (${fixMojibake(it?.source?.domain)})\n  Link: ${it.url}`
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
          `• ${it?.date || "sin fecha"} — ${fixMojibake(it?.title)}\n  Fuente: ${fixMojibake(it?.source?.name)} (${fixMojibake(it?.source?.domain)})\n  Link: ${it?.url}\n  Nota: ${fixMojibake(it?.snippet)}`
      )
      .join("\n\n")
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
  }, [id, tab, compareWith]);

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
        helper: "Modo LOCAL (real): responde usando SOLO el JSON local del candidato. Siempre muestra links del registro.",
        suggested: ["resumen", "controversias", "investigaciones"],
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
      setAnswer("Consulta bloqueada: tema de vida privada no pertinente a evaluación política en VOTO CLARO.");
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

    // ✅ NEWS (Actuar político) — JSON LOCAL en /public/actuar
    if (tab === "NEWS") {
      setBusy(true);
      setAnswer("Consultando archivo local (JSON)…");
      setCitations([]);

      try {
        const rawId = String(id ?? "");
        const normalizedId = normalizeCandidateSlug(rawId);

        // 1) Intento directo (compatibilidad con lo ya existente)
        let url = `/actuar/${encodeURIComponent(rawId)}.json`;
        let res = await fetch(url, { cache: "no-store" });

        // 2) Fallback normalizado (acentos / mayúsculas / ñ / espacios)
        if (!res.ok && normalizedId && normalizedId !== rawId) {
          url = `/actuar/${encodeURIComponent(normalizedId)}.json`;
          res = await fetch(url, { cache: "no-store" });
        }

        if (!res.ok) {
          setAnswer(
            "No encontré el archivo local de Actuar Político para este candidato.\n\n" +
              `Archivo esperado: ${url}\n\n` +
              "Si este tema no está registrado aquí, puedes buscar más noticias en Internet en fuentes confiables."
          );
          setCitations([]);
          return;
        }

        // ✅ AQUÍ ya NO falla: file existe dentro del try
        const file: any = await res.json();

        // ✅ Arreglar TODO el JSON (tildes, mojibake, etc.)
        const fixedFile: any = deepFixMojibake(file);

        // ✅ Normalizar slug interno
        if (fixedFile?.candidate_slug) {
          fixedFile.candidate_slug = normalizeCandidateSlug(fixedFile.candidate_slug);
        }

        // ✅ Respuesta usando SOLO el JSON local
        const out = buildActuarAnswer(fixedFile, q);
        setAnswer(out);

        // ✅ Mostrar “Fuentes” como lista clickeable en la UI (cuando existan)
        const items = Array.isArray(fixedFile?.items) ? fixedFile.items : [];

        const entries: Array<[string, Source]> = items
          .filter((it: any) => typeof it?.url === "string" && !!it?.source?.name)
          .map((it: any) => [
            it.url as string,
            {
              title: `${fixMojibake(it.source.name)}${it.source.domain ? ` (${fixMojibake(it.source.domain)})` : ""}`,
              url: it.url as string,
            },
          ]);

        const mappedSources = Array.from(new Map<string, Source>(entries).values()).slice(0, 10);
        setCitations(mappedSources);
      } catch (e: any) {
        setAnswer(
          "No pude leer el archivo local de Actuar Político.\n\n" +
            "Detalle técnico: " +
            String(e?.message ?? e)
        );
        setCitations([]);
      } finally {
        setBusy(false);
      }
      return;
    }

  // ✅ HV y PLAN: primero JSON LOCAL (/public/hv | /public/plan). Si no existe → fallback IA (/api/ai/answer)
 if (tab === "HV" || tab === "PLAN") {
  setBusy(true);
  setAnswer("Consultando archivo local (JSON)…");
  setCitations([]);

  const rawId = String(id ?? "");
  const normalizedId = normalizeCandidateSlug(rawId);

  const folder = tab === "HV" ? "hv" : "plan"; // /public/hv | /public/plan
  const doc = tab === "HV" ? "hv" : "plan";

  // util mínimo (local al bloque): tokens para “buscar evidencia” en texto
  const stop = new Set([
    "que","qué","de","del","la","el","los","las","un","una","y","o","en","por","para","con","sin","sobre",
    "es","son","fue","ser","se","su","sus","al","a","mi","tu","tus","me","te","lo","le","les","como","cómo",
    "cual","cuál","cuáles","quien","quién","quiénes","cuando","cuándo","donde","dónde","porque","porqué"
  ]);

  function tokenize(input: string) {
    return String(input ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 4 && !stop.has(x));
  }

  function snippet(text: string, max = 420) {
    const s = String(text ?? "").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, max).trim() + "…";
  }

  try {
    // 1) Intento directo por rawId (compatibilidad)
    let url = `/${folder}/${encodeURIComponent(rawId)}.json`;
    let res = await fetch(url, { cache: "no-store" });

    // 2) Fallback normalizado (acentos / mayúsculas / ñ / espacios)
    if (!res.ok && normalizedId && normalizedId !== rawId) {
      url = `/${folder}/${encodeURIComponent(normalizedId)}.json`;
      res = await fetch(url, { cache: "no-store" });
    }

    // ✅ Si existe JSON → responder LOCAL
    if (res.ok) {
      const fileRaw: any = await res.json();
      const fixed: any = deepFixMojibake(fileRaw);

// ✅ IMPORTANTE: normalizeHvJne2026 SOLO para HV.
// ✅ PLAN debe conservar "axes" intacto.
const file: any = tab === "HV" ? normalizeHvJne2026(fixed) : fixed;


    // =========================
// ✅ PLAN desde JSON local (axes)
// Formato esperado:
// { axes: { SEG|ECO|SAL|EDU: { found, title, summary } } }
// =========================
if (tab === "PLAN") {
  console.log("[PLAN] url leído:", url);
console.log("[PLAN] keys file:", file ? Object.keys(file) : null);
console.log("[PLAN] axes type:", typeof (file as any)?.axes, "value:", (file as any)?.axes);

  const axes = file?.axes && typeof file.axes === "object" ? file.axes : null;

  if (!axes) {
    setAnswer(
      "Encontré el JSON local del Plan, pero no contiene `axes`.\n\n" +
        `Archivo leído: ${url}`
    );
    setCitations([]);
    return;
  }

  // Normalizar pregunta
  const q0 = String(q ?? "");
  const qn = q0
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  // 1) Si el usuario eligió un eje desde chips (o lo menciona), respondemos ese eje
  let axis: CompareAxis | null = null;

  if (qn.includes("seguridad")) axis = "SEG";
  else if (qn.includes("econom") || qn.includes("empleo") || qn.includes("trabajo")) axis = "ECO";
  else if (qn.includes("salud") || qn.includes("hospital") || qn.includes("medic")) axis = "SAL";
  else if (qn.includes("educ") || qn.includes("coleg") || qn.includes("univers")) axis = "EDU";

  // También soporta que el usuario escriba "SEG", "ECO", etc.
  if (!axis) {
    if (/\bseg\b/.test(qn)) axis = "SEG";
    else if (/\beco\b/.test(qn)) axis = "ECO";
    else if (/\bsal\b/.test(qn)) axis = "SAL";
    else if (/\bedu\b/.test(qn)) axis = "EDU";
  }

  // 2) Si pregunta "resumen", damos resumen de los 4 ejes
  if (qn.includes("resumen") || qn.includes("ejes") || qn.includes("plan completo")) {
    const order: CompareAxis[] = ["SEG", "ECO", "SAL", "EDU"];

    const parts = order.map((k) => {
      const a = (axes as any)?.[k];
      const title = fixMojibake(a?.title ?? k);
      const found = !!a?.found;
      const sum = fixMojibake(a?.summary ?? "");

      if (!found || !sum.trim()) return `• ${title}: No hay evidencia suficiente en el plan.`;
      return `• ${title}: ${sum.trim()}`;
    });

    setAnswer("Plan de Gobierno (JSON local) — resumen por ejes:\n\n" + parts.join("\n\n"));
    setCitations([{ title: "Plan de Gobierno (JSON local)" }]);
    return;
  }

  // 3) Si detectamos un eje -> devolvemos ese eje
  if (axis) {
    const a = (axes as any)?.[axis];
    const title = fixMojibake(a?.title ?? axis);
    const found = !!a?.found;
    const sum = fixMojibake(a?.summary ?? "");

    if (!found || !sum.trim()) {
      setAnswer(`No hay evidencia suficiente en el Plan (JSON local) para el eje: ${title}.`);
      setCitations([]);
      return;
    }

    setAnswer(`Plan de Gobierno (JSON local) — ${title}\n\n${sum.trim()}`);
    setCitations([{ title: "Plan de Gobierno (JSON local)" }]);
    return;
  }

  // 4) Si no detecta eje, intentamos match básico en summaries (tokens)
  const tokens = tokenize(q0);

  const order: CompareAxis[] = ["SEG", "ECO", "SAL", "EDU"];
  const scored = order
    .map((k) => {
      const a = (axes as any)?.[k];
      const txt = String(a?.summary ?? "");
      const hay = txt
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { k, a, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    setAnswer("No hay evidencia suficiente en el Plan (JSON local) para esa pregunta.");
    setCitations([]);
    return;
  }

  const best = scored[0];
  const title = fixMojibake(best?.a?.title ?? best.k);
  const sum = fixMojibake(best?.a?.summary ?? "").trim();

  if (!sum) {
    setAnswer("No hay evidencia suficiente en el Plan (JSON local) para esa pregunta.");
    setCitations([]);
    return;
  }

  setAnswer(`Plan de Gobierno (JSON local) — ${title}\n\n${sum}`);
  setCitations([{ title: "Plan de Gobierno (JSON local)" }]);
  return;
}

     // =========================
// ✅ HV desde JSON local
// =========================
if (tab === "HV") {
  // Flatten simple (key-path → value) para buscar evidencia en campos
  const entries: Array<{ path: string; value: string }> = [];

  function walk(v: any, path: string) {
    if (v == null) return;

    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      const str = String(v).trim();
      if (str) entries.push({ path, value: str });
      return;
    }

    if (Array.isArray(v)) {
      v.forEach((it, idx) => walk(it, `${path}[${idx}]`));
      return;
    }

    if (typeof v === "object") {
      for (const k of Object.keys(v)) {
        walk(v[k], path ? `${path}.${k}` : k);
      }
    }
  }

  walk(file, "");

  if (!entries.length) {
    setAnswer(
      "Encontré el JSON local de Hoja de Vida, pero no pude extraer campos de texto.\n\n" +
        `Archivo leído: ${url}`
    );
    setCitations([]);
    return;
  }

  const tokens = tokenize(q);
// ✅ DATOS PERSONALES: resolver antes de "resumen" y antes del scoring (dni/edad/domicilio/partido/etc.)
const qnDP2 = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");
if (qnDP2 === "dni" || qnDP2 === "edad") {

  const dp = (file as any)?.datos_personales ?? {};
  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  const nac = dp?.lugar_nacimiento ?? {};
  const dom = dp?.domicilio ?? {};

  // edad (si hay fecha válida YYYY-MM-DD)
  let edad = "";
  const fn = String(dp?.fecha_nacimiento ?? "").trim();
  const m = fn.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const today = new Date();
    let years = today.getFullYear() - y;
    const ok =
      today.getMonth() + 1 > mo || (today.getMonth() + 1 === mo && today.getDate() >= d);
    if (!ok) years -= 1;
    if (Number.isFinite(years) && years >= 0 && years <= 120) edad = String(years);
  }

  const lines: string[] = [];
  lines.push("Hoja de Vida (archivo local) — datos personales:\n");

  const nombre = `${fix(dp?.nombres)} ${fix(dp?.apellidos?.paterno)} ${fix(dp?.apellidos?.materno)}`
    .replace(/\s+/g, " ")
    .trim();
  if (nombre) lines.push(`• Nombre: ${nombre}`);
  if (dp?.dni) lines.push(`• DNI: ${fix(dp?.dni)}`);
  if (dp?.sexo) lines.push(`• Sexo: ${fix(dp?.sexo)}`);
  if (fn) lines.push(`• Nacimiento: ${fix(fn)}${edad ? ` (Edad: ${edad})` : ""}`);

  const nacStr = `${fix(nac?.distrito)}, ${fix(nac?.provincia)}, ${fix(nac?.departamento)}, ${fix(nac?.pais)}`
    .replace(/(^,\s*)|(\s*,\s*$)/g, "")
    .replace(/\s+,/g, ",")
    .trim();
  if (nacStr) lines.push(`• Nació en: ${nacStr}`);

  const domStr = `${fix(dom?.distrito)}, ${fix(dom?.provincia)}, ${fix(dom?.departamento)}, ${fix(dom?.pais)}`
    .replace(/(^,\s*)|(\s*,\s*$)/g, "")
    .replace(/\s+,/g, ",")
    .trim();
  if (domStr) lines.push(`• Domicilio: ${domStr}`);

  if (dp?.organizacion_politica) lines.push(`• Organización política: ${fix(dp?.organizacion_politica)}`);
  if (dp?.cargo_postula) lines.push(`• Postula a: ${fix(dp?.cargo_postula)}`);
  if (dp?.circunscripcion) lines.push(`• Circunscripción: ${fix(dp?.circunscripcion)}`);

  setAnswer(lines.join("\n"));
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}

  // ✅ Resumen si piden resumen o no hay tokens
  if (q.toLowerCase().includes("resumen") || tokens.length === 0) {
    const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

    const fmtMoney = (n: any) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return "";
      return `S/ ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Si viene en formato NUEVO (espejo JNE), armamos un resumen humano.
   const hasNewSchema =
  String((file as any)?.meta?.formato ?? "")
    .toLowerCase()
    .includes("jne") ||
  String((file as any)?.kind ?? "")
    .toUpperCase()
    .includes("HV") ||
  ((file as any)?.datos_personales && typeof (file as any)?.datos_personales === "object");


     if (hasNewSchema) {
      const dp = (file as any)?.datos_personales ?? {};
      const exp = (file as any)?.experiencia_laboral?.registros ?? [];
      const fa = (file as any)?.formacion_academica ?? {};
     const univ = fa?.estudios_universitarios?.registros ?? [];

      const pos = fa?.posgrado?.registros ?? [];
      const tp = (file as any)?.trayectoria_partidaria ?? {};
      const cargosPart = tp?.cargos_partidarios?.registros ?? [];
      const renuncias = tp?.renuncias?.registros ?? [];
      const pen = (file as any)?.sentencias?.ambito_penal?.registros ?? [];

      const ib = (file as any)?.ingresos_bienes_rentas ?? {};
      const ing = ib?.ingresos ?? {};
      const inm = ib?.bienes_inmuebles?.registros ?? [];
      const veh = ib?.bienes_muebles?.vehiculos ?? [];
      const acc = ib?.acciones_y_participaciones?.registros ?? [];

      const lines: string[] = [];

      // 1) Datos personales (resumen)
      lines.push("**Datos personales**");
      lines.push(`• Nombre: ${fix(dp?.nombres)} ${fix(dp?.apellidos?.paterno)} ${fix(dp?.apellidos?.materno)}`.trim());
      lines.push(`• DNI: ${fix(dp?.dni)} | Sexo: ${fix(dp?.sexo)} | Nacimiento: ${fix(dp?.fecha_nacimiento)}`);
      lines.push(
        `• Nació en: ${fix(dp?.lugar_nacimiento?.distrito)}, ${fix(dp?.lugar_nacimiento?.provincia)}, ${fix(dp?.lugar_nacimiento?.departamento)}, ${fix(dp?.lugar_nacimiento?.pais)}`
      );
      lines.push(
        `• Domicilio: ${fix(dp?.domicilio?.distrito)}, ${fix(dp?.domicilio?.provincia)}, ${fix(dp?.domicilio?.departamento)}, ${fix(dp?.domicilio?.pais)}`
      );
      lines.push(
        `• Organización: ${fix(dp?.organizacion_politica)} | Postula: ${fix(dp?.cargo_postula)} | Circunscripción: ${fix(dp?.circunscripcion)}`
      );
      lines.push("");

      // 2) Experiencia laboral
      lines.push("**Experiencia laboral (últimos registros declarados)**");
      if (!exp.length) lines.push("• No registra experiencia laboral.");
      else {
        exp.slice(0, 5).forEach((r: any) => {
          lines.push(
            `• ${fix(r?.centro_trabajo)} — ${fix(r?.ocupacion_profesion)} (${fix(r?.desde_anio)}–${fix(r?.hasta_anio)})` +
              (r?.ruc_empresa_opcional ? ` | RUC: ${fix(r?.ruc_empresa_opcional)}` : "")
          );
        });
      }
      lines.push("");

      // 3) Formación
      lines.push("**Formación académica**");
      const prim = fa?.educacion_basica_regular?.primaria;
      const sec = fa?.educacion_basica_regular?.secundaria;
      lines.push(`• Primaria: ${prim?.cuenta ? (prim?.concluida ? "Concluida" : "No concluida") : "No declara"}`);
      lines.push(`• Secundaria: ${sec?.cuenta ? (sec?.concluida ? "Concluida" : "No concluida") : "No declara"}`);

      if (univ.length) {
        lines.push("• Universitaria:");
        univ.forEach((u: any) => lines.push(`  - ${fix(u?.grado_o_titulo)} — ${fix(u?.universidad)} (${fix(u?.anio_obtencion)})`));
      } else lines.push("• Universitaria: No declara.");

      if (pos.length) {
        lines.push("• Posgrado:");
        pos.forEach((p: any) => {
          const grado = fix(p?.grado_obtenido);
          lines.push(`  - ${fix(p?.especializacion)} — ${fix(p?.centro_estudios)}` + (grado ? ` | Grado: ${grado}` : ""));
        });
      } else lines.push("• Posgrado: No declara.");
      lines.push("");

      // 4) Trayectoria partidaria
      lines.push("**Trayectoria partidaria / política**");
      if (cargosPart.length) cargosPart.forEach((c: any) => lines.push(`• ${fix(c?.organizacion_politica)} — ${fix(c?.cargo)} (${fix(c?.desde_anio)}–${fix(c?.hasta)})`));
      else lines.push("• No declara cargos partidarios.");

      if (renuncias.length) {
        lines.push("• Renuncias:");
        renuncias.forEach((r: any) => lines.push(`  - ${fix(r?.organizacion_politica)} (${fix(r?.anio_renuncia)})`));
      }
      lines.push("");

      // 5) Sentencias
      lines.push("**Relación de sentencias (ámbito penal)**");
      if (!pen.length) lines.push("• No declara sentencias penales firmes.");
      else pen.forEach((s: any) => lines.push(`• Exp. ${fix(s?.expediente)} | ${fix(s?.fecha_sentencia_firme)} | ${fix(s?.organo_judicial)} | Delito: ${fix(s?.delito)} | Fallo: ${fix(s?.fallo_o_pena)}`));
      lines.push("");

      // 6) Ingresos + bienes
      lines.push("**Ingresos, bienes y rentas**");
      const anio = ing?.anio_declarado ? ` (${fix(ing?.anio_declarado)})` : "";
      const totalIng = fmtMoney(ing?.total_ingresos);
      lines.push(`• Total ingresos${anio}: ${totalIng || "No declara"}`);
      lines.push(`• Inmuebles declarados: ${Array.isArray(inm) ? inm.length : 0}`);
      lines.push(`• Vehículos declarados: ${Array.isArray(veh) ? veh.length : 0}`);

      const totalMuebles = fmtMoney(ib?.bienes_muebles?.total_bienes_muebles);
      if (totalMuebles) lines.push(`• Total bienes muebles: ${totalMuebles}`);

      if (veh.length) {
        lines.push("• Vehículos (muestra):");
        veh.slice(0, 3).forEach((v: any) => lines.push(`  - ${fix(v?.placa)}: ${fix(v?.descripcion)} | ${fmtMoney(v?.valor)}`));
      }

      if (acc.length) {
        lines.push("• Acciones/participaciones (muestra):");
        acc.slice(0, 3).forEach((a: any) => lines.push(`  - ${fix(a?.persona_juridica)}: ${fix(a?.equivalencia)} (N°: ${fix(a?.numero_acciones_participaciones)})`));
      }

      setAnswer("Hoja de Vida (archivo local) — resumen estructurado:\n\n" + lines.join("\n"));
      setCitations([{ title: "Hoja de Vida (archivo local)" }]);
      return;
    }

    // ✅ Legacy (si no viene esquema nuevo)
    const top = entries.slice(0, 10).map((e) => `• ${e.path}: ${snippet(e.value, 160)}`);
    setAnswer("Hoja de Vida (archivo local) — resumen de campos:\n\n" + top.join("\n"));
    setCitations([{ title: "Hoja de Vida (archivo local)" }]);
    return;
  }

  // ✅ Si el usuario pregunta por "estudios/formación", devolvemos TODOS los registros del JSON
const qnEdu = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

if (
  qnEdu.includes("estudi") ||
  qnEdu.includes("formac") ||
  qnEdu.includes("univers") ||
  qnEdu.includes("posgrad") ||
  qnEdu.includes("maestr") ||
  qnEdu.includes("doctor") ||
  qnEdu.includes("titulo") ||
  qnEdu.includes("grado") ||
  qnEdu.includes("coleg") ||
  qnEdu.includes("primar") ||
  qnEdu.includes("secund")
) {
  const fa = (file as any)?.formacion_academica ?? {};
  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  const out: string[] = [];
  out.push("Hoja de Vida (archivo local) — formación académica (todos los registros):");

 // Básica
const prim = fa?.educacion_basica_regular?.primaria;
const sec = fa?.educacion_basica_regular?.secundaria;

out.push("\n**Educación básica**");
out.push(`• Primaria: ${prim?.cuenta ? (prim?.concluida ? "Concluida" : "No concluida") : "No declara"}`);
out.push(`• Secundaria: ${sec?.cuenta ? (sec?.concluida ? "Concluida" : "No concluida") : "No declara"}`);

// No universitarios
const noUniv = fa?.estudios_no_universitarios?.registros ?? [];
out.push("\n**No universitarios**");
if (!Array.isArray(noUniv) || noUniv.length === 0) {
  out.push("• No declara estudios no universitarios.");
} else {
  noUniv.forEach((n: any, i: number) => {
    out.push(`\n**Registro ${i + 1}**`);
    if (n?.centro_estudios) out.push(`• Centro de estudios: ${fix(n.centro_estudios)}`);
    if (n?.especialidad) out.push(`• Especialidad: ${fix(n.especialidad)}`);
    if (n?.anio_inicio) out.push(`• Año inicio: ${fix(n.anio_inicio)}`);
    if (n?.anio_fin) out.push(`• Año fin: ${fix(n.anio_fin)}`);
    if (n?.concluidos !== undefined) out.push(`• Concluido: ${n.concluidos ? "Sí" : "No"}`);
  });
}

// Universitaria
const univ = fa?.estudios_universitarios?.registros ?? [];
out.push("\n**Universitaria**");
if (!Array.isArray(univ) || univ.length === 0) {
  out.push("• No declara estudios universitarios.");
} else {
  univ.forEach((u: any, i: number) => {
    out.push(`\n**Registro ${i + 1}**`);
    if (u?.grado_o_titulo) out.push(`• Grado/Título: ${fix(u.grado_o_titulo)}`);
    if (u?.universidad) out.push(`• Universidad: ${fix(u.universidad)}`);
    if (u?.anio_obtencion) out.push(`• Año de obtención: ${fix(u.anio_obtencion)}`);
    if (u?.pais) out.push(`• País: ${fix(u.pais)}`);
    if (u?.concluidos !== undefined) out.push(`• Concluido: ${u.concluidos ? "Sí" : "No"}`);
  });
}
  // Posgrado
  const pos = fa?.posgrado?.registros ?? [];
  out.push("\n**Posgrado**");
  if (!Array.isArray(pos) || pos.length === 0) {
    out.push("• No declara posgrado.");
  } else {
    pos.forEach((p: any, i: number) => {
      out.push(`\n**Registro ${i + 1}**`);
      if (p?.especializacion) out.push(`• Programa: ${fix(p.especializacion)}`);
      if (p?.centro_estudios) out.push(`• Centro de estudios: ${fix(p.centro_estudios)}`);
      if (p?.grado_obtenido) out.push(`• Grado obtenido: ${fix(p.grado_obtenido)}`);
      if (p?.pais) out.push(`• País: ${fix(p.pais)}`);
    });
  }

  setAnswer(out.join("\n"));
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}

// ✅ Si el usuario pregunta por "ingresos/bienes/rentas", devolvemos TODOS los registros del JSON
const qnAssets = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

if (
  qnAssets.includes("ingreso") ||
  qnAssets.includes("renta") ||
  qnAssets.includes("bien") ||
  qnAssets.includes("patrimon") ||
  qnAssets.includes("inmuebl") ||
  qnAssets.includes("vehicul") ||
  qnAssets.includes("auto") ||
  qnAssets.includes("carro") ||
  qnAssets.includes("acciones") ||
  qnAssets.includes("particip")
) {
  const ib = (file as any)?.ingresos_bienes_rentas ?? {};
  const ing = ib?.ingresos ?? {};
  const inm = ib?.bienes_inmuebles?.registros ?? [];
  const veh = ib?.bienes_muebles?.vehiculos ?? [];
  const acc = ib?.acciones_y_participaciones?.registros ?? [];

  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  const fmtMoney = (n: any) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    return `S/ ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const out: string[] = [];
  out.push("Hoja de Vida (archivo local) — ingresos, bienes y rentas (todos los registros):");

  // Ingresos
  out.push("\n**Ingresos**");
  const anio = ing?.anio_declarado ? fix(ing.anio_declarado) : "";
  const totalIng = fmtMoney(ing?.total_ingresos);
  out.push(`• Año declarado: ${anio || "No declara"}`);
  out.push(`• Total ingresos: ${totalIng || "No declara"}`);

  // Inmuebles
  out.push("\n**Bienes inmuebles**");
  if (!Array.isArray(inm) || inm.length === 0) out.push("• No registra inmuebles.");
  else {
    out.push(`• Cantidad: ${inm.length}`);
    inm.slice(0, 12).forEach((r: any, i: number) => {
      out.push(`\n**Registro ${i + 1}**`);
      if (r?.tipo) out.push(`• Tipo: ${fix(r.tipo)}`);
      if (r?.direccion) out.push(`• Dirección: ${fix(r.direccion)}`);
      if (r?.partida) out.push(`• Partida: ${fix(r.partida)}`);
      if (r?.valor) out.push(`• Valor: ${fmtMoney(r.valor) || fix(r.valor)}`);
    });
    if (inm.length > 12) out.push(`\n• (Mostrando 12 de ${inm.length})`);
  }

  // Vehículos
  out.push("\n**Vehículos**");
  if (!Array.isArray(veh) || veh.length === 0) out.push("• No registra vehículos.");
  else {
    out.push(`• Cantidad: ${veh.length}`);
    veh.forEach((v: any, i: number) => {
      out.push(`\n**Registro ${i + 1}**`);
      if (v?.placa) out.push(`• Placa: ${fix(v.placa)}`);
      if (v?.descripcion) out.push(`• Descripción: ${fix(v.descripcion)}`);
      if (v?.valor) out.push(`• Valor: ${fmtMoney(v.valor) || fix(v.valor)}`);
    });
  }

  // Acciones
  out.push("\n**Acciones / participaciones**");
  if (!Array.isArray(acc) || acc.length === 0) out.push("• No registra acciones/participaciones.");
  else {
    out.push(`• Cantidad: ${acc.length}`);
    acc.slice(0, 12).forEach((a: any, i: number) => {
      out.push(`\n**Registro ${i + 1}**`);
      if (a?.persona_juridica) out.push(`• Empresa: ${fix(a.persona_juridica)}`);
      if (a?.equivalencia) out.push(`• Participación: ${fix(a.equivalencia)}`);
     if (a?.numero_acciones_participaciones) out.push(`• Número de acciones/participaciones: ${fix(a.numero_acciones_participaciones)}`);
    });
    if (acc.length > 12) out.push(`\n• (Mostrando 12 de ${acc.length})`);
  }

  setAnswer(out.join("\n"));
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}
// ✅ DEBUG: confirmar que entramos a "ingresos/bienes"
if (String(q ?? "").toLowerCase().includes("ingres")) {
  setAnswer("DEBUG: Entró al bloque de ingresos.");
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}
// ✅ Si el usuario pregunta por "datos personales", devolvemos esa sección completa
/*const qnDP = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

if (
  qnDP.includes("dni") ||
  qnDP.includes("documento") ||
  qnDP.includes("edad") ||
  qnDP.includes("naci") ||
  qnDP.includes("fecha de nacimiento") ||
  qnDP.includes("domic") ||
  qnDP.includes("vive") ||
  qnDP.includes("direccion") ||
  qnDP.includes("distrito") ||
  qnDP.includes("provincia") ||
  qnDP.includes("depart") ||
  qnDP.includes("pais") ||
  qnDP.includes("organiza") ||
  qnDP.includes("partido") ||
  qnDP.includes("postula") ||
  qnDP.includes("cargo") ||
  qnDP.includes("circuns")
) {
  const dp = (file as any)?.datos_personales ?? {};
  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  const nac = dp?.lugar_nacimiento ?? {};
  const dom = dp?.domicilio ?? {};

  // edad (si hay fecha válida)
  let edad = "";
  const fn = String(dp?.fecha_nacimiento ?? "").trim();
  const m = fn.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const today = new Date();
    let years = today.getFullYear() - y;
    const hasHadBirthday =
      today.getMonth() + 1 > mo || (today.getMonth() + 1 === mo && today.getDate() >= d);
    if (!hasHadBirthday) years -= 1;
    if (Number.isFinite(years) && years >= 0 && years <= 120) edad = String(years);
  }

  const lines: string[] = [];
  lines.push("Hoja de Vida (archivo local) — datos personales:\n");

  const nombre = `${fix(dp?.nombres)} ${fix(dp?.apellidos?.paterno)} ${fix(dp?.apellidos?.materno)}`.replace(/\s+/g, " ").trim();
  if (nombre) lines.push(`• Nombre: ${nombre}`);
  if (dp?.dni) lines.push(`• DNI: ${fix(dp?.dni)}`);
  if (dp?.sexo) lines.push(`• Sexo: ${fix(dp?.sexo)}`);
  if (fn) lines.push(`• Nacimiento: ${fix(fn)}${edad ? ` (Edad: ${edad})` : ""}`);

  const nacStr = `${fix(nac?.distrito)}, ${fix(nac?.provincia)}, ${fix(nac?.departamento)}, ${fix(nac?.pais)}`.replace(/(^,\s*)|(\s*,\s*$)/g, "").replace(/\s+,/g, ",").trim();
  if (nacStr) lines.push(`• Nació en: ${nacStr}`);

  const domStr = `${fix(dom?.distrito)}, ${fix(dom?.provincia)}, ${fix(dom?.departamento)}, ${fix(dom?.pais)}`.replace(/(^,\s*)|(\s*,\s*$)/g, "").replace(/\s+,/g, ",").trim();
  if (domStr) lines.push(`• Domicilio: ${domStr}`);

  if (dp?.organizacion_politica) lines.push(`• Organización política: ${fix(dp?.organizacion_politica)}`);
  if (dp?.cargo_postula) lines.push(`• Postula a: ${fix(dp?.cargo_postula)}`);
  if (dp?.circunscripcion) lines.push(`• Circunscripción: ${fix(dp?.circunscripcion)}`);

  setAnswer(lines.join("\n"));
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}*/

// ✅ Si el usuario pregunta por trayectoria política/partidaria, devolvemos TODOS los registros
const qnPol = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

if (
  qnPol.includes("trayectoria") ||
  qnPol.includes("partidar") ||
  qnPol.includes("politic") ||
  qnPol.includes("militan") ||
  qnPol.includes("cargos partid") ||
  qnPol.includes("cargos") ||
  qnPol.includes("renunc")
) {
  const tp = (file as any)?.trayectoria_partidaria ?? {};
  const cargos = tp?.cargos_partidarios?.registros ?? [];
  const renuncias = tp?.renuncias?.registros ?? [];

  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  const out: string[] = [];
  out.push("Hoja de Vida (archivo local) — trayectoria partidaria / política (todos los registros):");

  out.push("\n**Cargos partidarios**");
  if (!Array.isArray(cargos) || cargos.length === 0) out.push("• No declara cargos partidarios.");
  else {
    cargos.forEach((c: any, i: number) => {
      out.push(`\n**Registro ${i + 1}**`);
      if (c?.organizacion_politica) out.push(`• Organización: ${fix(c.organizacion_politica)}`);
      if (c?.cargo) out.push(`• Cargo: ${fix(c.cargo)}`);
      if (c?.desde_anio || c?.hasta) out.push(`• Periodo: ${fix(c.desde_anio)}–${fix(c.hasta)}`);
      if (c?.actualidad !== undefined) out.push(`• Actual: ${c.actualidad ? "Sí" : "No"}`);
    });
  }

  out.push("\n**Renuncias**");
  if (!Array.isArray(renuncias) || renuncias.length === 0) out.push("• No declara renuncias.");
  else {
    renuncias.forEach((r: any, i: number) => {
      out.push(`\n**Registro ${i + 1}**`);
      if (r?.organizacion_politica) out.push(`• Organización: ${fix(r.organizacion_politica)}`);
      if (r?.anio_renuncia) out.push(`• Año: ${fix(r.anio_renuncia)}`);
      if (r?.motivo) out.push(`• Motivo: ${fix(r.motivo)}`);
    });
  }

  setAnswer(out.join("\n"));
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}
// ✅ Información adicional opcional
const qnInfo = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

if (
  qnInfo.includes("informacion adicional") ||
  qnInfo.includes("declaracion adicional") ||
  qnInfo.includes("declaracion jurada") ||
  qnInfo.includes("observacion") ||
  qnInfo.includes("nota adicional")
) {
  const info = (file as any)?.informacion_adicional_opcional ?? {};
  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  if (!info?.tiene_informacion || !info?.texto) {
    setAnswer("Hoja de Vida (archivo local) — información adicional:\n\n• No registra información adicional.");
    setCitations([{ title: "Hoja de Vida (archivo local)" }]);
    return;
  }

  setAnswer(
    "Hoja de Vida (archivo local) — información adicional:\n\n" +
      `• ${fix(info.texto)}`
  );
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}

  // ✅ Evidencia por tokens (no resumen)
  const scored = entries
    .map((e) => {
      const hay = `${e.path} ${e.value}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    setAnswer("No hay evidencia suficiente en la Hoja de Vida (archivo local) para esa pregunta.");
    setCitations([]);
    return;
  }

  const picked = scored.slice(0, 8).map((x) => x.e);

 // ✅ Formateo humano si la evidencia es de sentencias
const looksLikeSentencias = picked.some((e) => e.path.startsWith("sentencias."));
// ✅ Si el usuario pregunta por "sentencias", devolvemos TODOS los registros del JSON (no solo picked)
const qnSent = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

 if (qnSent.includes("sentenc") || qnSent.includes("proceso") || qnSent.includes("denuncia")) {
  const penRegs = (file as any)?.sentencias?.ambito_penal?.registros ?? [];
  const civilRegs = (file as any)?.sentencias?.ambito_civil?.registros ?? [];
  const famRegs = (file as any)?.sentencias?.ambito_familiar?.registros ?? [];

  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  function fmtRegs(title: string, regs: any[]) {
    if (!Array.isArray(regs) || regs.length === 0) return [`**${title}**`, "• No registra."];
    const out: string[] = [`**${title}**`];
    regs.forEach((r: any, i: number) => {
      out.push(`\n**Registro ${i + 1}**`);
      if (r?.expediente) out.push(`• Expediente: ${fix(r.expediente)}`);
      if (r?.fecha_sentencia_firme) out.push(`• Fecha: ${fix(r.fecha_sentencia_firme)}`);
      if (r?.organo_judicial) out.push(`• Órgano judicial: ${fix(r.organo_judicial)}`);
      if (r?.materia) out.push(`• Materia: ${fix(r.materia)}`);
      if (r?.delito) out.push(`• Delito: ${fix(r.delito)}`);
      if (r?.fallo_o_pena) out.push(`• Resultado: ${fix(r.fallo_o_pena)}`);
      if (r?.situacion) out.push(`• Situación: ${fix(r.situacion)}`);
      if (r?.modalidad) out.push(`• Modalidad: ${fix(r.modalidad)}`);
    });
    return out;
  }

  const parts: string[] = [];
  parts.push(...fmtRegs("Sentencias / procesos — ámbito penal", penRegs), "");
  parts.push(...fmtRegs("Sentencias / procesos — ámbito civil", civilRegs), "");
  parts.push(...fmtRegs("Sentencias / procesos — ámbito familiar", famRegs));

  setAnswer("Hoja de Vida (archivo local) — sentencias / procesos (todos los registros):\n\n" + parts.join("\n"));
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}

// ✅ Si el usuario pregunta por "trabajos/experiencia laboral", devolvemos TODOS los registros del JSON
const qnWork = String(q ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

if (
  qnWork.includes("trabaj") ||
  qnWork.includes("emple") ||
  qnWork.includes("experien") ||
  qnWork.includes("laboral") ||
  qnWork.includes("ocupac")
) {
  const regs = (file as any)?.experiencia_laboral?.registros ?? [];
  const fix = (x: any) => fixMojibake(String(x ?? "")).trim();

  if (!Array.isArray(regs) || regs.length === 0) {
    setAnswer("Hoja de Vida (archivo local) — experiencia laboral:\n\n• No registra experiencia laboral.");
    setCitations([{ title: "Hoja de Vida (archivo local)" }]);
    return;
  }

  const out: string[] = [];
  out.push("Hoja de Vida (archivo local) — experiencia laboral (todos los registros):");

  regs.forEach((r: any, i: number) => {
    out.push("\n" + `**Registro ${i + 1}**`);
    if (r?.centro_trabajo) out.push(`• Centro de trabajo: ${fix(r.centro_trabajo)}`);
    if (r?.ocupacion_profesion) out.push(`• Ocupación / profesión: ${fix(r.ocupacion_profesion)}`);
    if (r?.desde_anio || r?.hasta_anio) out.push(`• Periodo: ${fix(r.desde_anio)}–${fix(r.hasta_anio)}`);
    if (r?.ruc_empresa_opcional) out.push(`• RUC: ${fix(r.ruc_empresa_opcional)}`);
    if (r?.pais) out.push(`• País: ${fix(r.pais)}`);
    if (r?.direccion) out.push(`• Dirección: ${fix(r.direccion)}`);
  });

  setAnswer(out.join("\n"));
  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}


if (looksLikeSentencias) {
// agrupar por índice registros[i]
const groups = new Map<string, string[]>();
const topLines: string[] = [];

for (const e of picked) {
  const p = e.path;

  if (p.endsWith(".tiene_informacion")) {
  
   topLines.push(`• Declara información de sentencias: ${String(e.value).toLowerCase() === "true" ? "Sí" : String(e.value).toLowerCase() === "false" ? "No" : snippet(e.value, 20)}`);


    continue;
  }

  const m = p.match(/sentencias\.ambito_penal\.registros\[(\d+)\]\.(.+)$/);
  if (!m) {
    // otros paths de sentencias que no siguen el patrón
    if (p.startsWith("sentencias.")) topLines.push(`• ${p.replace(/^sentencias\./, "Sentencias → ")}: ${snippet(e.value, 160)}`);
    continue;
  }

  const idx = m[1];
  const field = m[2];

  const bucketKey = `Registro ${Number(idx) + 1}`;
  if (!groups.has(bucketKey)) groups.set(bucketKey, []);

  const line =
    field === "expediente"
      ? `• Expediente: ${snippet(e.value, 120)}`
      : field === "fecha_sentencia_firme"
      ? `• Fecha de sentencia firme: ${snippet(e.value, 120)}`
      : field === "organo_judicial"
      ? `• Órgano judicial: ${snippet(e.value, 160)}`
      : field === "delito"
      ? `• Delito: ${snippet(e.value, 160)}`
      : field === "fallo_o_pena"
      ? `• Resultado: ${snippet(e.value, 160)}`
      : `• ${field}: ${snippet(e.value, 160)}`;

  groups.get(bucketKey)!.push(line);
}

// construir salida
const lines: string[] = [];
lines.push(...topLines);

for (const [k, arr] of groups.entries()) {
  lines.push("");
  lines.push(`**${k}**`);
  // dedupe simple manteniendo orden
  const dedup = Array.from(new Set(arr));
  lines.push(...dedup);
}

  setAnswer("Hoja de Vida (archivo local) — sentencias (evidencia):\n\n" + lines.join("\n"));
} else {
  setAnswer(
    "Hoja de Vida (archivo local) — evidencia encontrada:\n\n" +
      picked.map((e) => `• ${e.path}: ${snippet(e.value, 260)}`).join("\n")
  );
}

  setCitations([{ title: "Hoja de Vida (archivo local)" }]);
  return;
}
}

    // ❗Si NO existe JSON → fallback IA como antes (sin romper flujo actual)
    setAnswer(tab === "HV" ? "Consultando Hoja de Vida con IA (PDF)…" : "Consultando Plan de Gobierno con IA (PDF)…");
    setCitations([]);

    const resIA = await fetch("/api/ai/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ id, doc, question: q }),
    });

    const payload = await safeReadJson(resIA);

    if (!resIA.ok) {
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
    setAnswer("Error: " + String(e?.message ?? e ?? "desconocido") + " | id=" + String(id ?? ""));
    setCitations([]);
  } finally {
    setBusy(false);
  }

  return;
}

setAnswer("Pestaña no soportada.");
setCitations([]);
return;
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

  // ✅ Helper local: intenta leer PLAN JSON local y extraer el summary del eje
  async function readLocalPlanAxis(candidateId: string, axis: CompareAxis) {
    const rawId = String(candidateId ?? "");
    const normalizedId = normalizeCandidateSlug(rawId);

    // 1) intento directo
    let url = `/plan/${encodeURIComponent(rawId)}.json`;
    let res = await fetch(url, { cache: "no-store" });

    // 2) fallback normalizado
    if (!res.ok && normalizedId && normalizedId !== rawId) {
      url = `/plan/${encodeURIComponent(normalizedId)}.json`;
      res = await fetch(url, { cache: "no-store" });
    }

    if (!res.ok) return null;

    const fileRaw: any = await res.json();
    const file: any = deepFixMojibake(fileRaw);

    const axes = file?.axes && typeof file.axes === "object" ? file.axes : null;
    if (!axes) return null;

    const node = (axes as any)?.[axis];
    const found = !!node?.found;
    const title = fixMojibake(node?.title ?? axis);
    const summary = fixMojibake(node?.summary ?? "").trim();

    if (!found || !summary) return null;

    return {
      answer: `Plan de Gobierno (JSON local) — ${title}\n\n${summary}`,
      citations: [{ title: "Plan de Gobierno (JSON local)" }] as Source[],
    };
  }

  try {
    // ✅ 1) Intento comparación LOCAL (solo si ambos tienen JSON local con axes)
    const localA = await readLocalPlanAxis(id, compareAxis);
    const localB = await readLocalPlanAxis(compareWith, compareAxis);

    if (localA && localB) {
      const compareData: CompareApiResponse = {
        axis: compareAxis,
        a: { id, answer: localA.answer, citations: localA.citations },
        b: { id: compareWith, answer: localB.answer, citations: localB.citations },
      };

      setCompareResult(compareData);

      // ✅ Enviar texto al asistente para 🔊 (igual que antes)
      try {
        const axisLabel =
          compareAxis === "SEG"
            ? "Seguridad"
            : compareAxis === "ECO"
            ? "Economía y empleo"
            : compareAxis === "SAL"
            ? "Salud"
            : "Educación";

        const aName = (profile?.full_name || slugToName(id)).trim();
        const bName = slugToName(compareWith).trim();

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

      // ✅ Mantener mini perfiles como antes
      const ids = `${id},${compareWith}`;
      const pr = await fetch(`/api/candidates/profile?ids=${encodeURIComponent(ids)}`, { cache: "no-store" });
      const prData = (await pr.json()) as ProfilesMultiResponse;
      if (pr.ok && prData?.profiles) setCompareProfiles(prData.profiles);

      return; // ✅ importantísimo: NO llamar API si ya resolvimos local
    }

    // ✅ 2) Fallback al flujo actual por API (sin romper nada)
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

      const aName = (
        compareProfiles?.[compareData.a.id]?.full_name ||
        profile?.full_name ||
        slugToName(compareData.a.id)
      ).trim();
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
    "group relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium " +
    "border transition-all duration-200 select-none " +
    "hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.99] " +
    "focus:outline-none focus:ring-2 focus:ring-green-200";

  const chipIdle = "border-red-300 bg-green-50/70 text-slate-800 hover:bg-green-100 hover:border-red-400";
  const chipActive =
    "border-green-900 bg-gradient-to-r from-green-700 to-green-800 text-white shadow-md ring-1 ring-red-300/60";

  function ChipBtn(props: { text: string; icon?: string; onClick: () => void }) {
    const active = question.trim() === props.text.trim();
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={`${chipBase} ${active ? chipActive : chipIdle} max-w-full sm:max-w-none`}
        aria-pressed={active}
        title={props.text}
      >
        <span className={`${active ? "opacity-100" : "opacity-80"} text-[13px] leading-none`}>
          {props.icon ?? "💡"}
        </span>
        <span className="whitespace-normal break-words text-left leading-snug">{props.text}</span>
      </button>
    );
  }

  // ✅ Tabs: estilo A-8 (borde rojo grueso, activo verde oscuro)
  const tabBase =
    "rounded-xl px-4 py-2 text-sm font-extrabold transition border-2";
  const tabOn =
    "bg-green-800 text-white border-green-900 shadow-md";
  const tabOff =
    "bg-white text-slate-900 border-red-400 hover:border-red-600 hover:bg-green-50";

  // ✅ Botones consistentes
  const btnPrimary =
    "group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white " +
    "border border-green-900 bg-green-800 " +
    "shadow-md transition-all duration-200 " +
    "hover:bg-green-900 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01] " +
    "active:translate-y-0 active:scale-[0.99] " +
    "focus:outline-none focus:ring-2 focus:ring-green-200 " +
    "disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden";

  const btnPrimaryShine =
    "after:content-[''] after:absolute after:inset-0 after:-translate-x-[120%] after:skew-x-[-20deg] " +
    "after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent " +
    "after:transition-transform after:duration-500 group-hover:after:translate-x-[120%]";

  const btnSecondary =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold " +
    "border border-red-700 bg-white text-red-700 " +
    "shadow-sm transition-all duration-200 " +
    "hover:bg-red-50 hover:shadow-md hover:-translate-y-0.5 " +
    "active:translate-y-0 active:scale-[0.99] " +
    "focus:outline-none focus:ring-2 focus:ring-green-200 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  const searchParams = useSearchParams();
  const fromCambio = searchParams.get("from") === "cambio";

  // ✅ Estilo global de bloques (A-8)
  const WRAP = "rounded-2xl border-[6px] border-red-700 bg-green-50 shadow-sm";
  const PANEL = `${WRAP} p-5`;
  const PANEL_WHITE = "bg-white";

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto bg-gradient-to-b from-green-100 via-green-50 to-green-100">
      {/* Top nav */}
      <div className="flex flex-wrap items-center gap-3">
        <a href="/" className={`${btnPrimary} ${btnPrimaryShine}`}>
          ← Volver a inicio
        </a>

        {fromCambio ? (
          <a href="/cambio-con-valentia" className={`${btnPrimary} ${btnPrimaryShine}`}>
            ← Un Cambio con Valentía
          </a>
        ) : null}
      </div>

      {/* Header candidato */}
      <div className={`mt-4 ${PANEL}`}>
        <div className="flex gap-4 items-start">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-200 shrink-0 border-2 border-red-300">
            {profile?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photo_url} alt={profile.full_name} className="w-full h-full object-cover" />
            ) : null}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xl font-extrabold text-slate-900">
                {loadingProfile ? "Cargando..." : profile?.full_name ?? "Candidato"}
              </div>
              <EvidenceBadge kind="GUIDE" />
              <EvidenceBadge kind="WITH_EVIDENCE" />
              <EvidenceBadge kind="NO_EVIDENCE" />
            </div>

            <div className="text-sm text-slate-800 font-semibold">{profile?.party_name ?? ""}</div>
            {profile?.hv_summary ? (
              <p className="text-sm mt-2 text-slate-800">{profile?.hv_summary ?? ""}</p>
            ) : null}
          </div>
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
      <div className={`mt-4 ${PANEL} ${PANEL_WHITE}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-lg font-extrabold text-slate-900">{active.title}</div>
          {tab === "NEWS" ? <EvidenceBadge kind="GUIDE" /> : <EvidenceBadge kind="WITH_EVIDENCE" />}
        </div>

        <p className="mt-2 text-sm text-slate-800">{active.helper}</p>

        <div className="mt-4">
          <div className="text-sm font-semibold text-slate-900">Preguntas sugeridas</div>
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
            <div className="text-sm font-semibold text-slate-900">Resumen por ejes (Plan de Gobierno)</div>

            <div className="mt-2 flex flex-wrap gap-2">
              <ChipBtn text="Propuestas sobre seguridad ciudadana." icon="🛡️" onClick={() => setQuestion("Propuestas sobre seguridad ciudadana.")} />
              <ChipBtn text="Propuestas sobre economía y empleo." icon="💼" onClick={() => setQuestion("Propuestas sobre economía y empleo.")} />
              <ChipBtn text="Propuestas sobre salud." icon="🩺" onClick={() => setQuestion("Propuestas sobre salud.")} />
              <ChipBtn text="Propuestas sobre educación." icon="🎓" onClick={() => setQuestion("Propuestas sobre educación.")} />
            </div>

            <p className="mt-2 text-xs text-slate-700">
              Este resumen se genera únicamente a partir del Plan de Gobierno (PDF) y siempre cita páginas. Si no hay evidencia, se indicará explícitamente.
            </p>
          </div>
        )}

        {tab === "PLAN" && (
          <div className={`mt-6 ${WRAP} p-4 bg-green-100`}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-extrabold text-slate-900">Comparar 2 candidatos (Plan vs Plan)</div>
              <EvidenceBadge kind="WITH_EVIDENCE" />
            </div>

            <p className="mt-1 text-xs text-slate-800">
              Comparación basada solo en PDFs. Si no hay evidencia en un plan, se indica explícitamente.
            </p>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-800">Comparar con</div>

                <select
                  className="mt-1 w-full border-2 border-red-400 rounded-xl p-2 bg-white text-slate-900 appearance-none pr-10 focus:outline-none focus:ring-2 focus:ring-green-200"
                  value={compareWith}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCompareWith(v);

                    // 🔑 guardar idB en la URL
                    const params = new URLSearchParams(window.location.search);
                    params.set("idB", v);
                    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
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
                  <div className="mt-1 text-[11px] text-red-700">
                    No se pudo cargar /api/candidates/index. Revisa consola/network.
                  </div>
                ) : null}
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-800">Eje</div>
                <select
                  className="mt-1 w-full border-2 border-red-400 rounded-xl p-2 bg-white text-slate-900 appearance-none pr-10 focus:outline-none focus:ring-2 focus:ring-green-200"
                  value={compareAxis}
                  onChange={(e) => {
                    const v = e.target.value as CompareAxis;
                    setCompareAxis(v);

                    // 🔑 guardar axis en la URL
                    const params = new URLSearchParams(window.location.search);
                    params.set("axis", v);
                    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
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

                <button type="button" onClick={clearCompare} className={btnSecondary} title="Limpiar comparación">
                  Limpiar
                </button>
              </div>
            </div>

            {compareResult ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${WRAP} p-4 bg-white min-w-0 overflow-hidden`}>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <MiniProfileHeader title="Candidato A" profile={aProfile} />
                    <EvidenceBadge
                      kind={compareResult.a.citations?.length ? "WITH_EVIDENCE" : "NO_EVIDENCE"}
                      page={compareResult.a.citations?.find((s) => typeof s.page === "number")?.page}
                      size="sm"
                    />
                  </div>

                  <p className="mt-3 text-sm whitespace-pre-wrap text-slate-800 break-words [overflow-wrap:anywhere]">
  {compareResult.a.answer}
</p>

                  {compareResult.a.citations?.length ? <Sources sources={compareResult.a.citations} /> : null}
                </div>

                <div className={`${WRAP} p-4 bg-white min-w-0 overflow-hidden`}>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <MiniProfileHeader title="Candidato B" profile={bProfile} />
                    <EvidenceBadge
                      kind={compareResult.b.citations?.length ? "WITH_EVIDENCE" : "NO_EVIDENCE"}
                      page={compareResult.b.citations?.find((s) => typeof s.page === "number")?.page}
                      size="sm"
                    />
                  </div>

                 <p className="mt-3 text-sm whitespace-pre-wrap text-slate-800 break-words [overflow-wrap:anywhere]">
  {compareResult.b.answer}
</p>

                  {compareResult.b.citations?.length ? <Sources sources={compareResult.b.citations} /> : null}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Pregunta */}
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-900">Tu pregunta</div>
          <textarea
            className="mt-2 w-full border-2 border-red-400 rounded-xl p-3 min-h-[90px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-200"
            placeholder="Escribe tu pregunta aquí..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <div className="mt-3 flex gap-2 flex-wrap">
            <button onClick={consult} disabled={busy} className={`${btnPrimary} ${btnPrimaryShine}`}>
              {busy
                ? "Consultando..."
                : tab === "HV"
                ? "Consultar (HV real)"
                : tab === "PLAN"
                ? "Consultar (PLAN real)"
                : "Consultar (Actuar político)"}
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
        <div className="mt-6">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-semibold text-slate-900">Respuesta</div>
            <EvidenceBadge kind={answerKind} page={citations.find((s) => typeof s.page === "number")?.page} size="sm" />
          </div>

         <p className="mt-2 text-sm whitespace-pre-wrap text-slate-800 break-words [overflow-wrap:anywhere]">
  {answer}
</p>

          {citations.length ? <Sources sources={citations} /> : null}

          {!citations.length && answer !== "—" ? (
            <div className="mt-2 text-xs text-slate-700">
              Si no aparecen páginas o fuentes, VOTO CLARO lo marca como <b>“Sin evidencia”</b>.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`${btnPrimary} ${btnPrimaryShine} px-5`}
        >
          ↑ Subir
        </button>
      </div>
    </main>
  );
}
