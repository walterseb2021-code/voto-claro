export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";


type Hit = { page: number; score: number; text: string };

const STOPWORDS = new Set([
  "de","la","el","y","a","en","un","una","unos","unas","por","para","con","sin","del","al",
  "que","se","su","sus","es","son","fue","ha","han","haber","como","qué","cual","cuál",
  "los","las","o","u","si","sí","no","ya","más","menos","muy","sobre","entre","tambien","también",
]);

/**
 * 🔒 Filtro de vida privada / no pertinente:
 * - Bloquea temas sexuales, vida íntima, familiares no relevantes, etc.
 * - No bloquea “hijos” si aparece en contexto patrimonial/declaración (pero el usuario preguntando por detalles íntimos sí).
 *
 * Ajusta esta lista si lo deseas.
 */
const PRIVATE_TOPIC_KEYWORDS = [
  // sexualidad / vida íntima
  "sexo","sexual","sexualidad","intimo","íntimo","intima","íntima","relacion sexual","relación sexual",
  "orientacion","orientación","gay","lesbiana","bisexual","trans","porno","pornografia","pornografía",
  // familia/vida privada (preguntas invasivas)
  "esposa","esposo","pareja","novia","novio","amante","infiel","infidelidad","divorcio","hijos","hijo","hija",
  "madre","padre","hermano","hermana","familia",
  // salud sensible / adicciones (si es chisme): aquí lo tratamos con cuidado
  "alcoholico","alcohólico","drogadicto","drogas","adicto","rehabilitacion","rehabilitación",
  "enfermedad","diagnostico","diagnóstico","salud mental","depresion","depresión",
];

function isPrivateOrIrrelevantQuestion(q: string) {
  const t = normalize(q);
  // Heurística: si contiene palabras privadas, se bloquea (salvo casos estrictamente públicos: sentencias/denuncias ya declaradas)
  // Como esto es HV (JNE), el usuario debería preguntar por datos declarados; si intenta vida íntima, se frena.
  return PRIVATE_TOPIC_KEYWORDS.some((k) => t.includes(normalize(k)));
}

function normalize(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hvPdfPathFromId(candidateId: string) {
  return path.join(process.cwd(), "data", "docs", "persona", `${candidateId}_hv.pdf`);
}

function runPdfToText(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const exe = "C:\\poppler\\poppler-25.12.0\\Library\\bin\\pdftotext.exe";

    // ✅ Si existe en Windows, úsalo (mantiene tu comportamiento actual)
    if (process.platform === "win32" && fs.existsSync(exe)) {
      execFile(
        exe,
        args,
        { windowsHide: true, maxBuffer: 50 * 1024 * 1024, encoding: "utf8" },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve(stdout || "");
        }
      );
      return;
    }

    // ❌ Si NO existe (ej: Vercel), que el caller use el fallback PDFJS
    reject(new Error("PDFTOTEXT_NOT_AVAILABLE"));
  });
}

function cleanText(s: string) {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPageText(pdfPath: string, pageNum: number) {
  try {
    const stdout = await runPdfToText([
      "-f",
      String(pageNum),
      "-l",
      String(pageNum),
      "-layout",
      pdfPath,
      "-",
    ]);
    return cleanText(stdout);
  } catch (e: any) {
    // ✅ Fallback para Vercel / Linux (sin poppler)
    const msg = String(e?.message ?? "");
    if (msg.includes("PDFTOTEXT_NOT_AVAILABLE") || msg.includes("ENOENT")) {
      const data = new Uint8Array(fs.readFileSync(pdfPath));
      const doc = await pdfjsLib.getDocument({ data }).promise;

      if (pageNum < 1 || pageNum > doc.numPages) return "";

      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();

      const text = (content.items as any[])
        .map((it) => (typeof it?.str === "string" ? it.str : ""))
        .join(" ");

      return cleanText(text);
    }
    throw e;
  }
}

function tokenize(q: string) {
  const raw = normalize(q)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens = raw.filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  // de-dup estable
  return Array.from(new Set(tokens));
}

/**
 * 🎯 “Campos HV” (intención guiada):
 * Si la pregunta contiene estas palabras, enriquecemos la búsqueda con términos típicos de HV.
 */
const FIELD_PACKS: Array<{
  name: string;
  triggers: string[];
  terms: string[];
}> = [
  {
    name: "sentencias_y_procesos",
    triggers: ["sentencia","sentencias","condena","condenado","antecedente","antecedentes","proceso","procesos","judicial","penal","civil","fiscal"],
    terms: ["sentencia","condena","proceso","expediente","juzgado","fiscalia","fiscalía","delito","pena","inhabilitacion","inhabilitación"],
  },
  {
    name: "estudios",
    triggers: ["estudio","estudios","universidad","titulo","título","grado","maestria","maestría","doctorado","colegio profesional"],
    terms: ["estudios","universidad","instituto","titulo","título","grado","maestria","maestría","doctorado","colegiatura","especialidad"],
  },
  {
    name: "experiencia_laboral",
    triggers: ["trabajo","laboral","experiencia","cargo","puesto","empleo","trayectoria"],
    terms: ["experiencia","laboral","cargo","puesto","empresa","entidad","funcion","función","periodo","período"],
  },
  {
    name: "ingresos_bienes",
    triggers: ["ingreso","ingresos","renta","remuneracion","remuneración","bienes","patrimonio","propiedad","inmueble","vehiculo","vehículo","deudas"],
    terms: ["ingresos","renta","remuneracion","remuneración","bienes","patrimonio","propiedad","inmueble","vehiculo","vehículo","deuda","deudas"],
  },
  {
    name: "organizacion_politica",
    triggers: ["partido","organizacion","organización","politica","política","postula"],
    terms: ["organizacion politica","organización política","partido","agrupacion","agrupación","postula","cargo al que postula"],
  },
];

function buildSearchTerms(question: string) {
  const qn = normalize(question);
  const tokens = tokenize(question);

  // Si parece pregunta por “campo”, agregamos términos típicos
  const extra: string[] = [];
  for (const pack of FIELD_PACKS) {
    if (pack.triggers.some((tr) => qn.includes(normalize(tr)))) {
      extra.push(...pack.terms.map(normalize));
    }
  }

  const terms = Array.from(new Set([...tokens.map(normalize), ...extra])).filter(Boolean);
  return terms;
}

function scorePage(text: string, terms: string[]) {
  const t = normalize(text);
  let score = 0;

  for (const term of terms) {
    if (!term) continue;
    const matches = t.split(term).length - 1;
    if (matches > 0) {
      // ponderación simple: términos más largos valen más
      score += matches * (term.length >= 8 ? 3 : term.length >= 5 ? 2 : 1);
    }
  }
  return score;
}

function makeSnippet(text: string, terms: string[], max = 750) {
  const clean = cleanText(text);
  if (!clean) return "";

  // Intento simple: cortar alrededor del primer término que aparezca
  const lower = normalize(clean);
  let idx = -1;
  let hitTerm = "";

  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i !== -1) {
      idx = i;
      hitTerm = term;
      break;
    }
  }

  if (idx === -1) {
    return clean.length <= max ? clean : clean.slice(0, max).trimEnd() + "…";
  }

  const start = Math.max(0, idx - 180);
  const end = Math.min(clean.length, start + max);
  const snippet = clean.slice(start, end).trim();

  // marca leve del término (sin inventar)
  return snippet || (hitTerm ? clean.slice(0, max).trimEnd() + "…" : clean.slice(0, max).trimEnd() + "…");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = (searchParams.get("id") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim();
  const pagesRaw = (searchParams.get("pages") ?? "30").trim();
  const maxPages = Math.min(Math.max(parseInt(pagesRaw, 10) || 30, 1), 60);

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!q || q.length < 4) return NextResponse.json({ error: "Missing or too short q" }, { status: 400 });

  // 🔒 BLOQUEO por vida privada / no pertinente
  if (isPrivateOrIrrelevantQuestion(q)) {
    return NextResponse.json({
      id,
      question: q,
      answer:
        "La app no responde preguntas sobre vida privada o aspectos no pertinentes al interés público. " +
        "Formula una pregunta basada en la Hoja de Vida (JNE) o en temas estrictamente vinculados a la función pública.",
      citations: [],
      rule: "Filtro de privacidad/pertinencia activado.",
    });
  }

  const pdfPath = hvPdfPathFromId(id);
  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      { error: "HV PDF not found", expected_path: `data/docs/persona/${id}_hv.pdf` },
      { status: 404 }
    );
  }

  // términos de búsqueda (campos + libre)
  const terms = buildSearchTerms(q);
  if (!terms.length) {
    return NextResponse.json({
      id,
      question: q,
      answer: "No hay evidencia suficiente en las fuentes consultadas.",
      citations: [],
      rule: "No se pudieron derivar términos de búsqueda útiles.",
    });
  }

  try {
    const hits: Hit[] = [];

    for (let p = 1; p <= maxPages; p++) {
      try {
        const text = await extractPageText(pdfPath, p);
        if (!text) continue;

        const sc = scorePage(text, terms);
        if (sc > 0) hits.push({ page: p, score: sc, text });
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("Wrong page range") || msg.includes("first page")) break;
        throw e;
      }
    }

    hits.sort((a, b) => b.score - a.score);
    const top = hits.slice(0, 3);

    if (!top.length) {
      return NextResponse.json({
        id,
        question: q,
        answer: "No hay evidencia suficiente en las fuentes consultadas.",
        citations: [],
        rule: "Solo PDF + páginas. Si no hay evidencia, se indica explícitamente.",
      });
    }

    const parts = top
      .map((h) => `p. ${h.page}: ${makeSnippet(h.text, terms)}`)
      .join("\n\n");

    return NextResponse.json({
      id,
      question: q,
      answer:
        `Respuesta basada en Hoja de Vida (JNE) (PDF):\n\n` +
        parts +
        `\n\nRegla: si un dato no aparece en el PDF consultado, se responde “No hay evidencia suficiente en las fuentes consultadas.”`,
      citations: top.map((h) => ({
        title: "Hoja de Vida (JNE) (PDF cargado por el admin)",
        page: h.page,
      })),
      rule: "Solo PDF + páginas. Si no hay evidencia, se indica explícitamente.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "ask/hv failed" }, { status: 500 });
  }
}
