// src/app/api/docs/plan/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { MOCK_CANDIDATES } from "@/lib/votoclaro/mockCandidates";
import DOMMatrix from "dommatrix";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "url";



if (!(globalThis as any).DOMMatrix) {
  (globalThis as any).DOMMatrix = DOMMatrix as any;
}

// ✅ Fix: pdfjs (fake worker) usa structuredClone y falla con DOMMatrix del polyfill
const __nativeStructuredClone = globalThis.structuredClone;

function __sanitizeForClone(v: any): any {
  if (!v) return v;

 // DOMMatrix / DOMMatrixReadOnly / "matrix-like" (no clonable en serverless). Lo convertimos a objeto simple.
if (typeof v === "object") {
  const name = (v as any)?.constructor?.name ?? "";

  const isDomMatrixFamily = typeof name === "string" && name.startsWith("DOMMatrix");

  const isMatrixLike =
    (v as any) &&
    typeof (v as any).a === "number" &&
    typeof (v as any).b === "number" &&
    typeof (v as any).c === "number" &&
    typeof (v as any).d === "number" &&
    typeof (v as any).e === "number" &&
    typeof (v as any).f === "number";

  if (isDomMatrixFamily || isMatrixLike) {
    return {
      a: (v as any).a,
      b: (v as any).b,
      c: (v as any).c,
      d: (v as any).d,
      e: (v as any).e,
      f: (v as any).f,
      is2D: (v as any).is2D ?? true,
    };
  }
}

  if (Array.isArray(v)) return v.map(__sanitizeForClone);

  // Typed arrays / ArrayBuffer: déjalos tal cual
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;

  if (typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = __sanitizeForClone(v[k]);
    return out;
  }

  return v;
}

function __isTransferable(x: any) {
  try {
    // ArrayBuffer / SharedArrayBuffer
    if (x instanceof ArrayBuffer) return true;
    if (typeof SharedArrayBuffer !== "undefined" && x instanceof SharedArrayBuffer) return true;

    // TypedArray/DataView -> su buffer es transferible, pero en transfer list puede venir el view o el buffer
    if (ArrayBuffer.isView(x)) return true;

    // MessagePort (Node)
    const name = x?.constructor?.name ?? "";
    if (name === "MessagePort") return true;

    return false;
  } catch {
    return false;
  }
}

function __sanitizeCloneOptions(options: any) {
  if (!options || typeof options !== "object") return options;

  const transfer = (options as any).transfer;
  if (!Array.isArray(transfer)) return options;

  // Dejamos solo transferibles reales
  const safeTransfer = transfer.filter(__isTransferable);

  // Importante: reconstruimos options con transfer limpio
  return { ...(options as any), transfer: safeTransfer };
}

if (typeof __nativeStructuredClone === "function") {
  (globalThis as any).structuredClone = (value: any, options?: any) => {
    try {
      return __nativeStructuredClone(value, options);
    } catch {
      const safeValue = __sanitizeForClone(value);
      const safeOptions = __sanitizeCloneOptions(options);
      return __nativeStructuredClone(safeValue, safeOptions);
    }
  };
}

// 🔒 Singleton de pdfjs (se carga UNA sola vez por instancia)
let PDFJS_SINGLETON: any = null;
/**
 * ✅ Cache en memoria para NO recalcular páginas repetidas (compare/plan llama muchas veces).
 * Clave: `${pdfPath}::${pageNum}`
 */
const PAGE_TEXT_CACHE = new Map<string, string>();

/**
 * Debug local (NO cambia respuesta JSON; solo consola).
 */
const DEBUG_TABULAR = false;

function getPdfToTextExe(): string | null {
  const fromEnv = process.env.PDFTOTEXT_PATH?.trim();
  if (fromEnv) return fromEnv;

  // Solo Windows local con Poppler instalado
  if (process.platform === "win32") {
    return "C:\\poppler\\poppler-25.12.0\\Library\\bin\\pdftotext.exe";
  }

  // En Linux/Vercel no asumimos que exista
  return null;
}


function runPdfToText(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const exe = getPdfToTextExe();
if (!exe) {
  throw new Error("pdftotext no disponible en este entorno (Vercel/Linux).");
}

    execFile(
      exe,
      args,
      {
        windowsHide: true,
        maxBuffer: 120 * 1024 * 1024,
        encoding: "utf8",
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || "").toString()));
          return;
        }
        resolve(stdout || "");
      }
    );
  });
}

type BBoxWord = { xMin: number; yMin: number; xMax: number; yMax: number; text: string };

function decodeXmlEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseBboxXml(xml: string): { words: BBoxWord[] } {
  const words: BBoxWord[] = [];

  const re =
    /<word\b[^>]*\bxMin="([\d.]+)"\s+yMin="([\d.]+)"\s+xMax="([\d.]+)"\s+yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const text = decodeXmlEntities(m[5] ?? "").trim();
    if (!text) continue;
    words.push({
      xMin: Number(m[1]),
      yMin: Number(m[2]),
      xMax: Number(m[3]),
      yMax: Number(m[4]),
      text,
    });
  }

  return { words };
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base] ?? sorted[sorted.length - 1];
  const b = sorted[base + 1] ?? a;
  return a + (b - a) * rest;
}

/**
 * -----------------------------
 * ✅ Limpieza + "reflow" para lectura tipo PDF-chat
 * -----------------------------
 */

function dehyphenateLineBreaks(t: string) {
  // "pro-\npuesta" => "propuesta"
  return t.replace(/(\p{L})-\n(\p{L})/gu, "$1$2");
}

function cleanBasicText(s: string) {
  let t = String(s || "");
  t = t.replace(/\r/g, "");
  t = dehyphenateLineBreaks(t);
  // colapsar tabs
  t = t.replace(/\t/g, " ");
  // no matar del todo dobles espacios (a veces ayudan a detectar columnas),
  // pero sí reducimos excesos gigantes
  t = t.replace(/[ ]{6,}/g, "     ");
  // normalizar saltos grandes
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function looksLikeSentenceEnd(line: string) {
  const s = (line || "").trim();
  if (!s) return true;
  return /[.!?…”")\]]\s*$/.test(s);
}

function startsLikeContinuation(nextLine: string) {
  const s = (nextLine || "").trim();
  if (!s) return false;
  // si inicia con minúscula o con conectores, suele ser continuación de la frase
  if (/^[a-záéíóúñü]/.test(s)) return true;
  if (/^(y|o|u|e|pero|además|así|por|para|con|sin|del|de|la|el|los|las)\b/i.test(s)) return true;
  return false;
}

/**
 * Reflow de párrafos:
 * - Une líneas cuando la anterior NO termina en puntuación
 *   y la siguiente parece continuación.
 * - Mantiene saltos de párrafo cuando hay línea en blanco.
 */
function reflowParagraphs(raw: string) {
  const t = cleanBasicText(raw);
  if (!t) return "";

  const src = t.split("\n");
  const out: string[] = [];

  let buf = "";
  for (let i = 0; i < src.length; i++) {
    const line = (src[i] ?? "").replace(/[ \t]+/g, " ").trimEnd();
    const isBlank = line.trim().length === 0;

    if (isBlank) {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      continue;
    }

    if (!buf) {
      buf = line.trim();
      continue;
    }

    const prev = buf;
    const prevEnds = looksLikeSentenceEnd(prev);
    const nextLooksCont = startsLikeContinuation(line);

    // si parece continuación, unimos
    if (!prevEnds && nextLooksCont) {
      buf = `${prev.trim()} ${line.trim()}`;
    } else {
      // si no, cerramos párrafo/linea y empezamos otra
      out.push(prev.trim());
      buf = line.trim();
    }
  }

  if (buf.trim()) out.push(buf.trim());

  // compactar: unir líneas muy cortas sueltas (títulos sin sentido) con la siguiente
  const compacted: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const cur = out[i] ?? "";
    const next = out[i + 1] ?? "";
    if (cur.length > 0 && cur.length < 18 && next && !looksLikeSentenceEnd(cur) && /^[A-ZÁÉÍÓÚÑÜ]/.test(next)) {
      compacted.push(`${cur} ${next}`);
      i++;
      continue;
    }
    compacted.push(cur);
  }

  return compacted.join("\n\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

/**
 * Score de "legibilidad tipo chat":
 * - premia texto con oraciones/párrafos
 * - penaliza pipes, demasiadas viñetas, demasiadas líneas muy cortas (síntoma de tabla)
 */
function textQualityScore(s: string) {
  const t = String(s || "").trim();
  if (!t) return -999;

  const len = t.length;

  const pipes = (t.match(/\|/g) ?? []).length;
  const bullets = (t.match(/•/g) ?? []).length;

  const sentenceMarks = (t.match(/[.!?¿¡]/g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;

  const lines = t.split("\n").filter((x) => x.trim().length > 0);
  const shortLines = lines.filter((x) => x.trim().length < 28).length;
  const shortRatio = lines.length ? shortLines / lines.length : 0;

  // “columnas” típicas: muchos espacios múltiples
  const multiSpaces = (t.match(/[ ]{3,}/g) ?? []).length;

  let score = 0;

  score += Math.min(18, sentenceMarks) * 7;
  score += Math.min(30, commas) * 1;
  score += Math.min(2600, len) / 45;

  // penalizaciones de tabla
  score -= pipes * 7;
  score -= bullets * 2.2;
  score -= shortRatio * 55;
  score -= multiSpaces * 0.35;

  return score;
}

function isLikelyTabularText(s: string) {
  const t = String(s || "").trim();
  if (!t) return false;

  const pipes = (t.match(/\|/g) ?? []).length;
  const bullets = (t.match(/•/g) ?? []).length;

  const lines = t.split("\n").filter((x) => x.trim().length > 0);
  const shortLines = lines.filter((x) => x.trim().length < 26).length;
  const shortRatio = lines.length ? shortLines / lines.length : 0;

  // si hay muchos pipes o muchas líneas cortas, suele ser tabla
  if (pipes >= 6) return true;
  if (shortRatio >= 0.55 && lines.length >= 10) return true;
  if (bullets >= 18 && shortRatio >= 0.45) return true;

  return false;
}

/**
 * -----------------------------
 * Altura típica de palabra / tolerancia de fila (dinámica).
 * -----------------------------
 */
function estimateWordHeight(words: BBoxWord[]) {
  const hs = words
    .map((w) => Math.max(0.1, w.yMax - w.yMin))
    .filter((h) => Number.isFinite(h) && h > 0.05)
    .sort((a, b) => a - b);
  if (!hs.length) return 2.4;
  return quantile(hs, 0.5) || 2.4;
}

function estimateRowTol(words: BBoxWord[]) {
  const h = estimateWordHeight(words);
  return Math.max(2.2, Math.min(6.5, h * 0.65 + 1.0));
}

function groupRowsDynamic(words: BBoxWord[], yTol?: number) {
  const sorted = [...words].sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin);
  const Y_TOL = yTol ?? estimateRowTol(words);

  const rows: Array<{ y: number; yMin: number; yMax: number; words: BBoxWord[] }> = [];

  for (const w of sorted) {
    let placed = false;
    for (const r of rows) {
      if (Math.abs(w.yMin - r.y) <= Y_TOL) {
        r.words.push(w);
        r.y = r.y * 0.9 + w.yMin * 0.1;
        r.yMin = Math.min(r.yMin, w.yMin);
        r.yMax = Math.max(r.yMax, w.yMax);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push({ y: w.yMin, yMin: w.yMin, yMax: w.yMax, words: [w] });
  }

  return rows.sort((a, b) => a.y - b.y);
}

function buildLines(words: BBoxWord[]) {
  const lines = groupRowsDynamic(words, estimateRowTol(words));

  const outLines: string[] = [];
  for (const line of lines) {
    const ws = line.words.sort((a, b) => a.xMin - b.xMin);
    let s = "";

    for (let i = 0; i < ws.length; i++) {
      const curr = ws[i];
      const prev = ws[i - 1];
      if (!prev) {
        s += curr.text;
        continue;
      }

      const gap = curr.xMin - prev.xMax;

      if (gap > 1.5 && gap <= 10) s += " ";
      else if (gap > 10 && gap <= 28) s += "   ";
      else if (gap > 28) s += "     ";

      s += curr.text;
    }

    s = s.replace(/[ \u00A0]+$/g, "").replace(/^[ \u00A0]+/g, "");
    if (s.trim().length) outLines.push(s);
  }

  return outLines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

/**
 * ✅ PASO C AVANZADO (K-means 1D) para detectar columnas en PDFs tipo Excel.
 */
function kmeans1D(points: number[], k: number, iters = 30) {
  const xs = points.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return { centroids: [] as number[], sse: 0 };

  const centroids: number[] = [];
  for (let i = 0; i < k; i++) {
    const qi = k === 1 ? 0.5 : i / (k - 1);
    centroids.push(quantile(xs, qi));
  }

  const assigns = new Array(xs.length).fill(0);

  for (let t = 0; t < iters; t++) {
    for (let i = 0; i < xs.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = Math.abs(xs[i] - centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assigns[i] = best;
    }

    const sum = new Array(k).fill(0);
    const cnt = new Array(k).fill(0);
    for (let i = 0; i < xs.length; i++) {
      const a = assigns[i];
      sum[a] += xs[i];
      cnt[a] += 1;
    }

    let changed = false;
    for (let c = 0; c < k; c++) {
      if (cnt[c] === 0) continue;
      const next = sum[c] / cnt[c];
      if (Math.abs(next - centroids[c]) > 0.25) changed = true;
      centroids[c] = next;
    }

    if (!changed) break;
  }

  let sse = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = assigns[i];
    const d = xs[i] - centroids[a];
    sse += d * d;
  }

  return { centroids: centroids.slice().sort((a, b) => a - b), sse };
}

function detectColumnsByClustering(words: BBoxWord[]) {
  if (words.length < 18) return { centroids: [] as number[] };

  const centers = words
    .map((w) => (w.xMin + w.xMax) / 2)
    .filter((x) => Number.isFinite(x));

  if (centers.length < 18) return { centroids: [] as number[] };

  let best = { centroids: [] as number[], score: Infinity };

  for (let k = 2; k <= 5; k++) {
    const { centroids, sse } = kmeans1D(centers, k, 30);
    if (centroids.length < 2) continue;

    const penalty = k * 220;
    const score = sse + penalty;

    if (score < best.score) best = { centroids, score };
  }

  if (best.centroids.length < 2) return { centroids: [] as number[] };

  const merged: number[] = [];
  for (const c of best.centroids) {
    const last = merged[merged.length - 1];
    if (last == null || Math.abs(c - last) > 24) merged.push(c);
  }

  if (merged.length < 2) return { centroids: [] as number[] };

  return { centroids: merged };
}

function detectColumnCuts(words: BBoxWord[]): number[] {
  if (words.length < 18) return [];

  const centers = words
    .map((w) => (w.xMin + w.xMax) / 2)
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);

  if (centers.length < 18) return [];

  const gaps: Array<{ gap: number; mid: number }> = [];
  for (let i = 0; i < centers.length - 1; i++) {
    const gap = centers[i + 1] - centers[i];
    gaps.push({ gap, mid: (centers[i] + centers[i + 1]) / 2 });
  }

  const gapVals = gaps.map((g) => g.gap).sort((a, b) => a - b);
  const q90 = quantile(gapVals, 0.9);
  const q95 = quantile(gapVals, 0.95);

  const TH_A = Math.max(18, q95, q90 * 1.35);

  const cutsA = gaps
    .filter((g) => g.gap >= TH_A)
    .map((g) => g.mid)
    .sort((a, b) => a - b);

  const mergedA: number[] = [];
  for (const c of cutsA) {
    const last = mergedA[mergedA.length - 1];
    if (last == null || Math.abs(c - last) > 18) mergedA.push(c);
  }

  const starts = words
    .map((w) => w.xMin)
    .filter((x) => Number.isFinite(x))
    .map((x) => Math.round(x / 6) * 6);

  const freq = new Map<number, number>();
  for (const x of starts) freq.set(x, (freq.get(x) ?? 0) + 1);

  const topStarts = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map((e) => e[0])
    .sort((a, b) => a - b);

  const uniqueStarts: number[] = [];
  for (const x of topStarts) {
    const last = uniqueStarts[uniqueStarts.length - 1];
    if (last == null || Math.abs(x - last) > 22) uniqueStarts.push(x);
  }

  let cutsB: number[] = [];
  if (uniqueStarts.length >= 3) {
    const sortedStarts = uniqueStarts.slice(0, 6).sort((a, b) => a - b);
    const mids: number[] = [];
    for (let i = 0; i < sortedStarts.length - 1; i++) {
      const gap = sortedStarts[i + 1] - sortedStarts[i];
      if (gap >= 30) mids.push((sortedStarts[i] + sortedStarts[i + 1]) / 2);
    }
    cutsB = mids;
  }

  const pick = (a: number[], b: number[]) => {
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    const score = (x: number[]) => {
      const n = x.length;
      const goodRange = n >= 2 && n <= 5 ? 2 : 0;
      return goodRange + n;
    };
    return score(b) > score(a) ? b : a;
  };

  const cuts = pick(mergedA, cutsB).sort((a, b) => a - b);

  const limited = cuts.length > 6 ? cuts.slice(0, 6) : cuts;

  const merged: number[] = [];
  for (const c of limited) {
    const last = merged[merged.length - 1];
    if (last == null || Math.abs(c - last) > 18) merged.push(c);
  }

  return merged;
}

function buildTableRowsByCentroids(words: BBoxWord[], centroids: number[]) {
  const rows = groupRowsDynamic(words, estimateRowTol(words));
  const table: string[][] = [];

  for (const r of rows) {
    const colWords: BBoxWord[][] = Array.from({ length: centroids.length }, () => []);
    for (const w of r.words) {
      const x = (w.xMin + w.xMax) / 2;

      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const d = Math.abs(x - centroids[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      colWords[best].push(w);
    }

    const cells = colWords.map((ws) => {
      if (!ws.length) return "";
      const ordered = ws.sort((a, b) => a.xMin - b.xMin);
      let s = "";
      for (let i = 0; i < ordered.length; i++) {
        const cur = ordered[i];
        const prev = ordered[i - 1];
        if (!prev) {
          s += cur.text;
          continue;
        }
        const gap = cur.xMin - prev.xMax;
        s += gap > 1.8 ? " " : "";
        s += cur.text;
      }
      return s.replace(/[ \u00A0]+/g, " ").trim();
    });

    table.push(cells);
  }

  return table;
}

function looksTabularByCentroids(table: string[][]) {
  let goodRows = 0;
  for (const row of table) {
    const nonEmpty = row.filter((c) => c && c.length >= 2).length;
    if (nonEmpty >= 2) goodRows++;
  }
  return goodRows >= 4;
}

function buildTableRowsByCuts(words: BBoxWord[], cuts: number[]) {
  const rows = groupRowsDynamic(words, estimateRowTol(words));
  const table: string[][] = [];

  for (const r of rows) {
    const colWords: BBoxWord[][] = Array.from({ length: cuts.length + 1 }, () => []);
    for (const w of r.words) {
      const x = (w.xMin + w.xMax) / 2;
      let idx = 0;
      while (idx < cuts.length && x > cuts[idx]) idx++;
      colWords[idx].push(w);
    }

    const cells = colWords.map((ws) => {
      if (!ws.length) return "";
      const ordered = ws.sort((a, b) => a.xMin - b.xMin);
      let s = "";
      for (let i = 0; i < ordered.length; i++) {
        const cur = ordered[i];
        const prev = ordered[i - 1];
        if (!prev) {
          s += cur.text;
          continue;
        }
        const gap = cur.xMin - prev.xMax;
        s += gap > 1.8 ? " " : "";
        s += cur.text;
      }
      return s.replace(/[ \u00A0]+/g, " ").trim();
    });

    table.push(cells);
  }

  return table;
}
function looksTabular(table: string[][]) {
  let goodRows = 0;
  for (const row of table) {
    const nonEmpty = row.filter((c) => c && c.length >= 2).length;
    if (nonEmpty >= 2) goodRows++;
  }
  return goodRows >= 4;
}

function normalizeCell(s: string) {
  return (s || "")
    .replace(/\s+([:;,.])/g, "$1")
    .replace(/([:;,.])([A-Za-zÁÉÍÓÚÑ])/g, "$1 $2")
    .replace(/[ \u00A0]+/g, " ")
    .trim();
}

function mergeContinuationRows(table: string[][]) {
  const out: string[][] = [];

  for (const rawRow of table) {
    const row = rawRow.map(normalizeCell);

    const nonEmptyIdx = row
      .map((c, i) => (c ? i : -1))
      .filter((i) => i >= 0);

    if (nonEmptyIdx.length === 0) continue;

    const isLeadingEmptyContinuation = !row[0] && nonEmptyIdx[0] > 0;
    const isSingleCellContinuation = nonEmptyIdx.length === 1 && out.length > 0;

    const looksLikeHeader = nonEmptyIdx.length === 1 && row[nonEmptyIdx[0]].length > 90;

    if ((isLeadingEmptyContinuation || isSingleCellContinuation) && out.length > 0 && !looksLikeHeader) {
      const prev = out[out.length - 1];

      if (nonEmptyIdx.length === 1) {
        const idx = nonEmptyIdx[0];

        let target = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (normalizeCell(prev[i])) {
            target = i;
            break;
          }
        }
        if (target === -1) target = Math.min(idx, prev.length - 1);

        const add = row[idx];
        if (add) prev[target] = normalizeCell(`${prev[target]} ${add}`);
      } else {
        for (const idx of nonEmptyIdx) {
          const add = row[idx];
          if (!add) continue;
          prev[idx] = normalizeCell(`${prev[idx]} ${add}`);
        }
      }

      continue;
    }

    out.push(row);
  }

  return out;
}

function renderTableHuman(table: string[][]) {
  const rows = mergeContinuationRows(table);

  const out: string[] = [];
  for (const r of rows) {
    const cells = r.map(normalizeCell);
    const nonEmpty = cells.filter(Boolean);
    if (!nonEmpty.length) continue;

    if (cells.length >= 2 && cells[0] && cells.slice(1).some(Boolean)) {
      const label = cells[0];
      const rest = cells.slice(1).filter(Boolean);

      if (label.length > 60) {
        out.push(`• ${nonEmpty.join("; ")}`);
      } else {
        out.push(`• ${label}: ${rest.join("; ")}`);
      }
      continue;
    }

    if (nonEmpty.length === 1) {
      out.push(`• ${nonEmpty[0]}`);
      continue;
    }

    out.push(`• ${nonEmpty.join("; ")}`);
  }

  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

/**
 * -----------------------------
 * ✅ NUEVO: MODO STRICT para TABLAS
 * -----------------------------
 */
function splitRowIntoSegmentsStrict(rowWords: BBoxWord[]) {
  const ws = [...rowWords].sort((a, b) => a.xMin - b.xMin);
  if (!ws.length) return [];

  const gaps: number[] = [];
  for (let i = 0; i < ws.length - 1; i++) gaps.push(ws[i + 1].xMin - ws[i].xMax);
  const g = gaps.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);

  const q75 = g.length ? quantile(g, 0.75) : 0;
  const q90 = g.length ? quantile(g, 0.9) : 0;

  const TH = Math.max(24, q90, q75 * 1.35);

  const segments: BBoxWord[][] = [];
  let cur: BBoxWord[] = [ws[0]];

  for (let i = 1; i < ws.length; i++) {
    const prev = ws[i - 1];
    const curr = ws[i];
    const gap = curr.xMin - prev.xMax;

    if (gap >= TH) {
      segments.push(cur);
      cur = [curr];
    } else {
      cur.push(curr);
    }
  }
  segments.push(cur);

  return segments;
}

function joinSegmentWords(seg: BBoxWord[]) {
  const ordered = [...seg].sort((a, b) => a.xMin - b.xMin);
  let s = "";
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    const prev = ordered[i - 1];
    if (!prev) {
      s += cur.text;
      continue;
    }
    const gap = cur.xMin - prev.xMax;
    s += gap > 1.8 ? " " : "";
    s += cur.text;
  }
  return normalizeCell(s);
}

function renderTabularBlockStrict(blockWords: BBoxWord[]) {
  const strictTol = Math.max(1.6, Math.min(3.2, estimateWordHeight(blockWords) * 0.45));
  const rows = groupRowsDynamic(blockWords, strictTol);

  const out: string[] = [];

  for (const r of rows) {
    const segs = splitRowIntoSegmentsStrict(r.words)
      .map(joinSegmentWords)
      .map((x) => x.trim())
      .filter(Boolean);

    if (!segs.length) continue;

    out.push(`• ${segs.join(" | ")}`);
  }

  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

/**
 * -----------------------------
 * ✅ Detectar BLOQUES tabulares por Y
 * -----------------------------
 */
type RowInfo = { y: number; yMin: number; yMax: number; words: BBoxWord[]; isTabular: boolean };

function countRowSegmentsByXGaps(rowWords: BBoxWord[]) {
  const ws = [...rowWords].sort((a, b) => a.xMin - b.xMin);
  if (ws.length < 2) return 1;

  const gaps: number[] = [];
  for (let i = 0; i < ws.length - 1; i++) gaps.push(ws[i + 1].xMin - ws[i].xMax);

  const g = gaps.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const q80 = g.length ? quantile(g, 0.8) : 0;

  const TH = Math.max(22, q80 * 1.15);

  let segs = 1;
  for (let i = 0; i < ws.length - 1; i++) {
    const gap = ws[i + 1].xMin - ws[i].xMax;
    if (gap >= TH) segs++;
  }
  return segs;
}

function classifyRows(words: BBoxWord[]): RowInfo[] {
  const rows = groupRowsDynamic(words, estimateRowTol(words));

  const out: RowInfo[] = rows.map((r) => {
    const segs = countRowSegmentsByXGaps(r.words);
    const isTabular = r.words.length >= 3 && segs >= 2;
    return { ...r, isTabular };
  });

  for (let i = 1; i < out.length - 1; i++) {
    if (!out[i].isTabular && out[i - 1].isTabular && out[i + 1].isTabular) {
      const lineTextLen = out[i].words.map((w) => w.text).join(" ").length;
      if (lineTextLen <= 120) out[i].isTabular = true;
    }
  }

  return out;
}

type TabularBlock = { startIdx: number; endIdx: number; yMin: number; yMax: number };

function detectTabularBlocks(words: BBoxWord[]) {
  const rows = classifyRows(words);

  const blocks: TabularBlock[] = [];
  let i = 0;

  while (i < rows.length) {
    if (!rows[i].isTabular) {
      i++;
      continue;
    }

    let j = i;
    while (j < rows.length && rows[j].isTabular) j++;

    const len = j - i;

    if (len >= 4) {
      const yMin = rows.slice(i, j).reduce((m, r) => Math.min(m, r.yMin), Number.POSITIVE_INFINITY);
      const yMax = rows.slice(i, j).reduce((m, r) => Math.max(m, r.yMax), Number.NEGATIVE_INFINITY);
      blocks.push({ startIdx: i, endIdx: j - 1, yMin, yMax });
    }

    i = j;
  }

  return { rows, blocks };
}

function wordsInYRange(words: BBoxWord[], yMin: number, yMax: number) {
  return words.filter((w) => w.yMin <= yMax + 0.3 && w.yMax >= yMin - 0.3);
}

function renderSmart(words: BBoxWord[]) {
  const { rows, blocks } = detectTabularBlocks(words);

  if (DEBUG_TABULAR) {
    console.log(
      `[docs/plan] words=${words.length} rows=${rows.length} blocks=${blocks.length} rowTol=${estimateRowTol(words).toFixed(
        2
      )}`
    );
    for (const b of blocks) {
      console.log(`[docs/plan] block y=[${b.yMin.toFixed(1)}..${b.yMax.toFixed(1)}] rows=${b.endIdx - b.startIdx + 1}`);
    }
  }

  if (!blocks.length) {
    const { centroids } = detectColumnsByClustering(words);

    if (centroids.length >= 2) {
      const table = buildTableRowsByCentroids(words, centroids);
      if (looksTabularByCentroids(table)) return renderTableHuman(table);
    }

    const cuts = detectColumnCuts(words);
    if (!cuts.length) return buildLines(words);

    const table = buildTableRowsByCuts(words, cuts);
    if (looksTabular(table)) return renderTableHuman(table);

    const cols: BBoxWord[][] = Array.from({ length: cuts.length + 1 }, () => []);
    for (const w of words) {
      const x = (w.xMin + w.xMax) / 2;
      let idx = 0;
      while (idx < cuts.length && x > cuts[idx]) idx++;
      cols[idx].push(w);
    }

    const blocksText = cols.map((col) => buildLines(col).trim()).filter((t) => t.length > 0);
    return blocksText.join("\n\n-----\n\n").trim();
  }

  const outParts: string[] = [];

  const sortedBlocks = [...blocks].sort((a, b) => a.yMin - b.yMin);
  let cursorY = Number.NEGATIVE_INFINITY;

  for (const b of sortedBlocks) {
    const before = words.filter((w) => w.yMax < b.yMin - 0.4 && w.yMin >= cursorY);
    const blockWords = wordsInYRange(words, b.yMin, b.yMax);

    if (before.length) {
      const txt = buildLines(before);
      if (txt) outParts.push(txt);
    }

    const tabTxt = renderTabularBlockStrict(blockWords);
    if (tabTxt) outParts.push(tabTxt);

    cursorY = b.yMax + 0.5;
  }

  const after = words.filter((w) => w.yMin >= cursorY);
  if (after.length) {
    const txt = buildLines(after);
    if (txt) outParts.push(txt);
  }

  return outParts
    .filter((x) => x && x.trim().length)
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/**
 * ✅ NUEVO: extraer en 3 modos y escoger el más legible (PDF-chat).
 * - BBOX: tablas
 * - LAYOUT: columnas
 * - PLAIN: texto “lineal” (suele ser mejor para planes narrativos)
 */
// ✅ Cache del texto por página

// ✅ Cache del PDF completo (para no leer el archivo 60 veces)
const PDF_BUFFER_CACHE = new Map<string, Uint8Array>();

/**
 * ✅ NUEVO (Vercel-friendly): extraer texto con pdfjs-dist (NO usa pdftotext)
 * Devuelve texto “lineal” tipo PDF-chat.
 */
async function extractPageText(pdfPath: string, pageNum: number) {
  const cacheKey = `${pdfPath}::${pageNum}`;
  const cached = PAGE_TEXT_CACHE.get(cacheKey);
  if (cached != null) return cached;

  // 1) Cargar PDF (desde disco) con cache
  let data = PDF_BUFFER_CACHE.get(pdfPath);
  if (!data) {
    const fsPromises = await import("fs/promises");
    const buf = await fsPromises.readFile(pdfPath);
    data = new Uint8Array(buf);
    PDF_BUFFER_CACHE.set(pdfPath, data);
  }

// 2) pdfjs-dist para Node — singleton async seguro (Vercel-friendly)
//    OJO: pdfjs-dist es ESM (.mjs). En Vercel NO debe cargarse con require().
const pdfjs: any = await (async () => {
  // ✅ PROMISE global (si no existe aún, créala una vez)
  if (!(globalThis as any).__PDFJS_SINGLETON_PROMISE) {
    (globalThis as any).__PDFJS_SINGLETON_PROMISE = import("pdfjs-dist/legacy/build/pdf.mjs").then((m: any) => {
      const pdfjs = m?.default ?? m;

      // ✅ FIX Vercel: ruta real del worker (aunque usemos disableWorker)
      try {
        const workerFsPath = path.join(
          process.cwd(),
          "node_modules",
          "pdfjs-dist",
          "legacy",
          "build",
          "pdf.worker.mjs"
        );
        pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFsPath).href;
      } catch {}

      return pdfjs;
    });
  }

  return (globalThis as any).__PDFJS_SINGLETON_PROMISE;
})();


try {
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    workerPort: null as any,
  });

  const pdf = await loadingTask.promise;

  if (pageNum < 1 || pageNum > pdf.numPages) {
    throw new Error("Wrong page range");
  }

  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();

  const raw = (content.items || [])
    .map((it: any) => (typeof it?.str === "string" ? it.str : ""))
    .filter(Boolean)
    .join(" ");

  const out = reflowParagraphs(raw || "");
  PAGE_TEXT_CACHE.set(cacheKey, out);
  return out;
} catch (e: any) {
  const msg = String(e?.message ?? "");

// ✅ Fallback controlado: solo usar pdftotext si realmente existe
const pdftotextExe = getPdfToTextExe();

if (
  pdftotextExe &&
  (msg.includes("DataCloneError") || msg.includes("Cannot transfer object"))
) {
  const txt = await runPdfToText([
    "-f",
    String(pageNum),
    "-l",
    String(pageNum),
    "-enc",
    "UTF-8",
    "-layout",
    pdfPath,
    "-",
  ]);

  const out = reflowParagraphs(txt || "");
  PAGE_TEXT_CACHE.set(cacheKey, out);
  return out;
}

throw e;

}
} 

function slugifyPartyName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes (más compatible que \p{Diacritic})
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/-+/g, "-")            // evita --- repetidos
    .replace(/^-+|-+$/g, "");       // quita - al inicio/fin
}
function loadCandidatesFromJson(): any[] {
  try {
    const p = path.join(process.cwd(), "data", "candidates.json");
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    // puede ser array directo o { candidates: [...] }
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  } catch {
    return [];
  }
}

function resolvePartyIdFromAnyId(id: string): { partyId: string | null; reason: string } {
  const clean = String(id ?? "").trim();
  if (!clean) return { partyId: null, reason: "EMPTY_ID" };

  // 1) Si ya nos pasan un partyId (slug), lo usamos
  // (ej: "partido-democratico-federal")
  const asSlug = slugifyPartyName(clean);

  // 2) Intentamos ver si es candidateId consultando data/candidates.json
  const candidates = loadCandidatesFromJson();

  const c =
    candidates.find((x: any) => String(x?.id ?? "").trim() === clean) ??
    candidates.find((x: any) => slugifyPartyName(String(x?.id ?? "")) === asSlug);

  if (c) {
    // probamos varios nombres de campo por si tu JSON usa uno distinto
    const fromField =
      c.party_id ??
      c.partyId ??
      c.party_slug ??
      c.partySlug ??
      c.party ??
      c.party_name ??
      c.partyName ??
      c.partido ??
      c.partido_nombre ??
      null;

    if (fromField) {
      return { partyId: slugifyPartyName(String(fromField)), reason: "FROM_CANDIDATE_JSON" };
    }
    return { partyId: null, reason: "CANDIDATE_FOUND_BUT_NO_PARTY_FIELD" };
  }

  // 3) Fallback: asumimos que id ya era partyId
  return { partyId: asSlug, reason: "ASSUME_PARTY_ID" };
}
function planPdfPathFromPartyId(partyId: string): string | null {
  const baseDir = path.join(process.cwd(), "data", "docs");

  const normalizedId = slugifyPartyName(String(partyId ?? ""));

  // 1) Intentos directos (rápidos)
  const direct = [
    path.join(baseDir, "partido", `${normalizedId}_plan.pdf`),
    path.join(baseDir, "plan", `${normalizedId}_plan.pdf`),
  ];

  for (const p of direct) {
    if (fs.existsSync(p)) return p;
  }

  // 2) Fallback robusto:
  // Recorre archivos en /partido y /plan y compara por "slug sin tildes".
  const dirs = [path.join(baseDir, "partido"), path.join(baseDir, "plan")];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.toLowerCase().endsWith("_plan.pdf")) continue;

        const fileId = file.replace(/_plan\.pdf$/i, "");
        const fileIdNormalized = slugifyPartyName(fileId);

        if (fileIdNormalized === normalizedId) {
          const abs = path.join(dir, file);
          if (fs.existsSync(abs)) return abs;
        }
      }
    } catch {
      // si no se puede leer la carpeta, seguimos
    }
  }

  return null;
}


function findHvPdf(candidateId: string): { abs: string; rel: string } | null {
  const dir = path.join(process.cwd(), "data", "docs", "persona");
  const patterns = [`${candidateId}_hv.pdf`, `${candidateId}.pdf`];

  for (const name of patterns) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return { abs, rel: `data/docs/persona/${name}` };
  }
  return null;
}

async function inferPartyNameFromHv(candidateId: string): Promise<{ partyName: string; hvPage: number } | null> {
  const hv = findHvPdf(candidateId);
  if (!hv) return null;

  const maxPagesToTry = 6;
  for (let p = 1; p <= maxPagesToTry; p++) {
    let text = "";
    try {
      text = await extractPageText(hv.abs, p);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("Wrong page range") || msg.includes("first page")) break;
      throw e;
    }

    const tNorm = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (!tNorm.includes("organizacion politica")) continue;

    const lines = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const lineNorm = lines[i].toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
      if (lineNorm.includes("organizacion politica")) {
        const parts = lines[i].split(":");
        if (parts.length >= 2) {
          const candidate = parts.slice(1).join(":").trim();
          const cleaned = candidate.split("|").map((s) => s.trim()).filter(Boolean)[0] ?? "";
          if (cleaned.length >= 3) return { partyName: cleaned, hvPage: p };
        }

        const next = (lines[i + 1] ?? "").trim();
        const cleanedNext = next.split("|").map((s) => s.trim()).filter(Boolean)[0] ?? "";
        if (cleanedNext.length >= 3) return { partyName: cleanedNext, hvPage: p };
      }
    }
  }

  return null;
}
function fixMojibake(input: string) {
  if (!input) return input;

  // Si ya está bien, no tocamos nada
  // (típico mojibake: "Ã", "Â", "ÔÇ", "pa├", "Per├")
  const looksBroken = /Ã|Â|ÔÇ|├|�|Per├|pa├|seg├|Econom├/g.test(input);
  if (!looksBroken) return input;

  // Intenta reparar: muchos extractores entregan texto en UTF-8 mal leído como Latin1.
  try {
    return Buffer.from(input, "latin1").toString("utf8");
  } catch {
    return input;
  }
}
function sanitizePdfText(input: string): string {
  if (!input) return input;

  return input
    // bullets y comillas raras típicas de PDF mal extraído
    .replace(/ÔÇó/g, "•")
    .replace(/ÔÇ£/g, "“")
    .replace(/ÔÇØ/g, "”")
    .replace(/ÔÇÖ/g, "’")
    .replace(/ÔÇô/g, "—")
    // caracteres de “mojibake” frecuentes
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã/g, "Á")
    .replace(/Ã/g, "É")
    .replace(/Ã/g, "Í")
    .replace(/Ã/g, "Ó")
    .replace(/Ã/g, "Ú")
    .replace(/Ã/g, "Ñ");
}
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
   const anyId = (searchParams.get("id") ?? "").trim();
   const candidateId = anyId; // ✅ siempre definido (si id era partySlug, igual queda como input)
let mock: any = null;       // ✅ lo usaremos en party_resolution sin romper scope

if (!anyId) {
  return NextResponse.json(

    { error: "Falta parámetro 'id' en la URL." },
    { status: 400 }
  );
}

// ✅ PRO: id puede ser candidateId o partyId
const resolved = resolvePartyIdFromAnyId(anyId);

// Si resolvePartyIdFromAnyId no logró nada, tratamos como candidateId para inferir desde HV
let partyId: string | null = resolved.partyId;

let partyName: string | null = null;
let inferredFromHv: { partyName: string; hvPage: number } | null = null;

// Si el id era candidateId, buscamos partido por mock/HV
if (resolved.reason !== "ASSUME_PARTY_ID") {

  const candidateId = anyId;

 mock = MOCK_CANDIDATES.find((c) => c.id === candidateId) ?? null;
partyName = mock?.party_name ?? null;

  if (!partyName) {
    inferredFromHv = await inferPartyNameFromHv(candidateId);
    partyName = inferredFromHv?.partyName ?? null;
  }

  if (!partyName && !partyId) {
   return NextResponse.json(

      {
        error:
          "No se pudo determinar el partido del candidato (ni por mock ni por HV).",
        rule: "Sin partido identificado no se puede cargar el plan.",
        debug: { anyId, resolved },
      },
      { status: 404 }
    );
  }

  if (!partyId && partyName) partyId = slugifyPartyName(partyName);
} else {
  // ✅ id ya era partyId
  partyName = null;
}

if (!partyId) {
  return NextResponse.json(

    {
      error: "No se pudo resolver partyId.",
      debug: { anyId, resolved },
    },
    { status: 404 }
  );
}

// partyId ya viene resuelto arriba (candidateId o partyId directo)
const pdfPath = planPdfPathFromPartyId(partyId);

if (!pdfPath) {

      return NextResponse.json(
        {
          error: "Plan de Gobierno no encontrado para el partido identificado.",
          party_name: partyName,
          party_id: partyId,
expected_paths: [
  `data/docs/partido/${partyId}_plan.pdf`,
  `data/docs/plan/${partyId}_plan.pdf`,
  `data/docs/partido/(variacion con tildes)_plan.pdf`,
],

          note:
            "Puede significar: (1) el partido no presentó plan, o (2) el archivo aún no fue cargado/nombrado con ese party_id.",
          hv_party_source: inferredFromHv ? { page: inferredFromHv.hvPage, label: "Organización política (HV)" } : null,
        },
        { status: 404 }
      );
    }

const maxPagesToTry = 60;
const pages: Array<{ page: number; text: string }> = [];

for (let p = 1; p <= maxPagesToTry; p++) {
  try {
    const raw = await extractPageText(pdfPath, p);
    const fixed = fixMojibake(raw);
    const text = sanitizePdfText(fixed).trim();

    if (text) pages.push({ page: p, text });

  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("Wrong page range") || msg.includes("first page")) break;
    throw e;
  }
}

    return NextResponse.json(
      {
        id: candidateId,
        party_name: partyName,
        party_id: partyId,
        filename: `${partyId}_plan.pdf`,
        pages_read: pages.length,
        pages,
        source: {
          title: "Plan de Gobierno (PDF por partido) (cargado por el admin)",
          page_range: pages.length ? `1-${pages.length}` : "0",
        },
        party_resolution: {
          from_mock: Boolean(mock?.party_name),
          from_hv: inferredFromHv ? { page: inferredFromHv.hvPage, field: "Organización política (HV)" } : null,
        },
        note:
          "Extracción por página en 3 modos: (A) BBOX anti-tablas + (B) LAYOUT refluido + (C) PLAIN refluido tipo PDF-chat; selector automático (tablas=>BBOX, narrativo=>PLAIN).",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
 } catch (e: any) {
  return NextResponse.json(
    {
      error: e?.message ?? "DOCS_PLAN_FAILED",
      stack: String(e?.stack ?? ""),
    },
     { status: 500 }
    );
  }
}

