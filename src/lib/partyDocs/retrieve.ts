// src/lib/partyDocs/retrieve.ts
import type { PartyDoc } from "./loadPartyDocs";

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin acentos
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function scoreByIncludes(haystack: string, needles: string[]) {
  const h = norm(haystack);
  let score = 0;
  for (const n of needles) {
    const nn = norm(n);
    if (!nn) continue;
    if (h.includes(nn)) score += 3;
  }
  return score;
}

function scoreByKeywords(keywords: string[] | undefined, tokens: string[]) {
  if (!keywords || keywords.length === 0) return 0;
  const ks = keywords.map(norm);
  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    for (const k of ks) {
      if (!k) continue;
      // match parcial (token dentro de keyword o keyword dentro del token)
      if (k.includes(t) || t.includes(k)) score += 2;
    }
  }
  return score;
}

type Chunk = {
  score: number;
  doc_id: string;
  title: string;
  kind: "principle" | "position" | "section" | "qa";
  topic?: string;
  text: string;
  keywords?: string[];
};

export function retrieveRelevantChunks(
  docs: PartyDoc[],
  userQuestion: string,
  opts?: { maxChunks?: number; minChunks?: number; maxPerDoc?: number }
) {
  const maxChunks = opts?.maxChunks ?? 16;
  const minChunks = opts?.minChunks ?? 8;
  const maxPerDoc = opts?.maxPerDoc ?? 6;

  const q = norm(userQuestion);
  const tokens = uniq(q.split(" ").filter(Boolean));

  const chunks: Chunk[] = [];

  for (const d of docs) {
    // principles
    for (const p of d.principles || []) {
      const text = `Principio: ${p.principle}`;
      const s =
        scoreByIncludes(text, tokens) +
        scoreByKeywords(p.keywords, tokens);

      if (s > 0) {
        chunks.push({
          score: s,
          doc_id: d.doc_id,
          title: d.title,
          kind: "principle",
          text,
          keywords: p.keywords
        });
      }
    }

    // sections
    for (const sct of d.sections || []) {
      const text = `Sección: ${sct.name}. ${sct.summary}`;
      const s =
        scoreByIncludes(text, tokens) +
        scoreByKeywords(sct.keywords, tokens) +
        scoreByIncludes(sct.name, tokens) * 2; // boost al nombre

      if (s > 0) {
        chunks.push({
          score: s,
          doc_id: d.doc_id,
          title: d.title,
          kind: "section",
          topic: sct.name,
          text,
          keywords: sct.keywords
        });
      }
    }

    // positions
    for (const pos of d.positions || []) {
      const how = (pos.how || []).join(" ");
      const text = `Tema: ${pos.topic}\nPostura: ${pos.stance}\nRazón: ${pos.why || ""}\nCómo: ${how}`;

      const s =
        scoreByIncludes(text, tokens) +
        scoreByKeywords(pos.keywords, tokens) +
        scoreByIncludes(pos.topic, tokens) * 4; // boost fuerte al tema

      if (s > 0) {
        chunks.push({
          score: s,
          doc_id: d.doc_id,
          title: d.title,
          kind: "position",
          topic: pos.topic,
          text,
          keywords: pos.keywords
        });
      }
    }

    // qa_seed
    for (const qa of d.qa_seed || []) {
      const text = `Q: ${qa.q}\nA: ${qa.a}`;
      const s = scoreByIncludes(text, tokens);

      if (s > 0) {
        chunks.push({
          score: s,
          doc_id: d.doc_id,
          title: d.title,
          kind: "qa",
          text
        });
      }
    }
  }

  // Orden por relevancia
  chunks.sort((a, b) => b.score - a.score);

  // Diversidad: no más de maxPerDoc por doc
  const perDocCount = new Map<string, number>();
  const selected: Chunk[] = [];

  for (const c of chunks) {
    const n = perDocCount.get(c.doc_id) ?? 0;
    if (n >= maxPerDoc) continue;
    selected.push(c);
    perDocCount.set(c.doc_id, n + 1);
    if (selected.length >= maxChunks) break;
  }

  // Fallback: si la pregunta es muy amplia o rara y salen pocos chunks,
  // metemos principios/secciones generales para dar contexto ideológico.
  if (selected.length < minChunks) {
    const extra: Chunk[] = [];

    for (const d of docs) {
      for (const p of (d.principles || []).slice(0, 4)) {
        extra.push({
          score: 1,
          doc_id: d.doc_id,
          title: d.title,
          kind: "principle",
          text: `Principio: ${p.principle}`,
          keywords: p.keywords
        });
      }
      for (const sct of (d.sections || []).slice(0, 3)) {
        extra.push({
          score: 1,
          doc_id: d.doc_id,
          title: d.title,
          kind: "section",
          topic: sct.name,
          text: `Sección: ${sct.name}. ${sct.summary}`,
          keywords: sct.keywords
        });
      }
    }

    for (const e of extra) {
      // evitar duplicados por texto + doc_id
      if (selected.some((x) => x.doc_id === e.doc_id && x.text === e.text)) continue;
      selected.push(e);
      if (selected.length >= minChunks) break;
    }
  }

  return selected.slice(0, maxChunks);
}
