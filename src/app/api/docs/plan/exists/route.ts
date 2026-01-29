export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  // id tal cual llega (puede incluir tildes)
  const rawId = id;

  // id normalizado (sin tildes, minúsculas, slug seguro)
  const normalizedId = id
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  const baseDir = path.join(process.cwd(), "data", "docs");

  // probamos ambas variantes (raw y normalized) en ambas carpetas
  const candidates = [
    path.join(baseDir, "partido", `${rawId}_plan.pdf`),
    path.join(baseDir, "plan", `${rawId}_plan.pdf`),
    path.join(baseDir, "partido", `${normalizedId}_plan.pdf`),
    path.join(baseDir, "plan", `${normalizedId}_plan.pdf`),
  ];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return NextResponse.json({ ok: true, id: normalizedId, exists: true, found: p });
    } catch {
      // sigue probando
    }
  }

  return NextResponse.json({ ok: true, id: normalizedId, exists: false, tried: candidates });
}
