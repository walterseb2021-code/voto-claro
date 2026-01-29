export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

type CandidateRole = "PRESIDENTE" | "VICE1" | "VICE2";

type Citation = {
  field: "party_name" | "role";
  page: number;
  snippet: string;
};

function runPdfToText(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const exe = "C:\\poppler\\poppler-25.12.0\\Library\\bin\\pdftotext.exe";
    execFile(
      exe,
      args,
      { windowsHide: true, maxBuffer: 50 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout || "");
      }
    );
  });
}

function cleanText(s: string) {
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPageText(pdfPath: string, pageNum: number) {
  const stdout = await runPdfToText(["-f", String(pageNum), "-l", String(pageNum), "-layout", pdfPath, "-"]);
  return cleanText(stdout);
}

function hvPdfPathFromId(candidateId: string) {
  return path.join(process.cwd(), "data", "docs", "persona", `${candidateId}_hv.pdf`);
}

function normalizeForSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Busca un valor en un bloque tipo:
 * "Organización política  :  PARTIDO XXX"
 * o en líneas cercanas:
 * "Organización política"
 * "PARTIDO XXX"
 */
function findFieldValue(rawText: string, labelVariants: string[]) {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const normLines = lines.map(normalizeForSearch);

  for (let i = 0; i < normLines.length; i++) {
    const ln = normLines[i];

    // 1) Caso: misma línea "label: valor"
    for (const label of labelVariants) {
      const lab = normalizeForSearch(label);
      if (ln.includes(lab)) {
        const original = lines[i];

        // intenta separar por ":" o "—" o " - "
        const m = original.split(/[:：\-–—]\s*/);
        if (m.length >= 2) {
          const value = m.slice(1).join(" ").trim();
          if (value && value.length >= 2) {
            return { value, snippet: original };
          }
        }

        // 2) Caso: el valor está en la siguiente línea (o dos líneas después)
        const next1 = lines[i + 1] ?? "";
        const next2 = lines[i + 2] ?? "";
        const candidate = next1.length >= 2 ? next1 : next2;
        if (candidate && candidate.length >= 2) {
          return { value: candidate.trim(), snippet: `${lines[i]} / ${candidate.trim()}` };
        }
      }
    }
  }

  return null;
}

function inferRoleFromText(roleText: string): CandidateRole | null {
  const t = normalizeForSearch(roleText);
  // Ajusta según cómo lo imprime el JNE en tu PDF
  if (t.includes("presidente")) return "PRESIDENTE";
  if (t.includes("primer") && t.includes("vice")) return "VICE1";
  if (t.includes("1") && t.includes("vice")) return "VICE1";
  if (t.includes("segundo") && t.includes("vice")) return "VICE2";
  if (t.includes("2") && t.includes("vice")) return "VICE2";
  if (t.includes("vicepresidente")) {
    // si no dice 1 o 2, no inventamos cuál
    return null;
  }
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  const pagesRaw = (searchParams.get("pages") ?? "6").trim();
  const maxPages = Math.min(Math.max(parseInt(pagesRaw, 10) || 6, 1), 15);

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const pdfPath = hvPdfPathFromId(id);
  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      { error: "HV PDF not found", expected_path: `data/docs/persona/${id}_hv.pdf` },
      { status: 404 }
    );
  }

  const citations: Citation[] = [];
  let party_name: string | null = null;
  let role: CandidateRole | null = null;

  try {
    for (let p = 1; p <= maxPages; p++) {
      let text = "";
      try {
        text = await extractPageText(pdfPath, p);
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("Wrong page range") || msg.includes("first page")) break;
        throw e;
      }
      if (!text) continue;

      // ✅ Organización política
      if (!party_name) {
        const found = findFieldValue(text, ["Organización política", "Organizacion politica", "Organización Politica"]);
        if (found?.value) {
          party_name = found.value;
          citations.push({ field: "party_name", page: p, snippet: found.snippet.slice(0, 200) });
        }
      }

      // ✅ Cargo al que postula
      if (!role) {
        const foundRole = findFieldValue(text, ["Cargo al que postula", "Cargo al que Postula", "Cargo"]);
        if (foundRole?.value) {
          const inferred = inferRoleFromText(foundRole.value);
          if (inferred) {
            role = inferred;
            citations.push({ field: "role", page: p, snippet: foundRole.snippet.slice(0, 200) });
          } else {
            // Si no se puede inferir, igual citamos el texto de cargo (pero no inventamos VICE1/VICE2)
            citations.push({ field: "role", page: p, snippet: foundRole.snippet.slice(0, 200) });
          }
        }
      }

      if (party_name && role) break;
    }

    // Regla estricta
    const ok = Boolean(party_name) || Boolean(role);

    return NextResponse.json({
      id,
      derived: {
        party_name: party_name ?? null,
        role: role ?? null,
      },
      citations,
      rule: ok
        ? "Datos derivados únicamente del PDF (Hoja de Vida) y citados por página."
        : "No hay evidencia suficiente en las fuentes consultadas.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Derive failed" }, { status: 500 });
  }
}
