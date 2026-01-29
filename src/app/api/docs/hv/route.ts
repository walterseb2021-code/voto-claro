export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

function runPdfToText(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const exe = "C:\\poppler\\poppler-25.12.0\\Library\\bin\\pdftotext.exe";

    execFile(
      exe,
      args,
      {
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024,
        encoding: "utf8",
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
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
}

function hvPdfPathFromId(candidateId: string) {
  // ✅ Estructura oficial confirmada:
  // data/docs/persona/<candidate_id>_hv.pdf
  return path.join(process.cwd(), "data", "docs", "persona", `${candidateId}_hv.pdf`);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const candidateId = (searchParams.get("id") ?? "").trim();

  if (!candidateId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const pdfPath = hvPdfPathFromId(candidateId);

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      {
        error: "HV PDF not found for this candidate.",
        expected_path: `data/docs/persona/${candidateId}_hv.pdf`,
      },
      { status: 404 }
    );
  }

  try {
    // MVP: leemos hasta N páginas; si el PDF tiene menos, paramos sin error
    const maxPagesToTry = 30;

    const pages: Array<{ page: number; text: string }> = [];
    for (let p = 1; p <= maxPagesToTry; p++) {
      try {
        const text = await extractPageText(pdfPath, p);
        pages.push({ page: p, text });
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("Wrong page range") || msg.includes("first page")) break;
        throw e;
      }
    }

    return NextResponse.json({
      id: candidateId,
      filename: `${candidateId}_hv.pdf`,
      pages_read: pages.length,
      pages,
      source: {
        title: "Hoja de Vida (JNE) (PDF cargado por el admin)",
        page_range: pages.length ? `1-${pages.length}` : "0",
      },
      note: "MVP: lectura hasta 30 páginas. Próximo paso: lectura por demanda (solo páginas relevantes) + cache.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to extract text with pdftotext" },
      { status: 500 }
    );
  }
}
