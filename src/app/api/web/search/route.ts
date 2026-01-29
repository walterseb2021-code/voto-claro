// src/app/api/web/search/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { isAllowedUrl, getDomain } from "@/lib/votoclaro/webAllowlist";

type CseItem = {
  title?: string;
  link?: string;
  snippet?: string;
};

type WebSearchItem = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const numRaw = Number(searchParams.get("num") ?? "6");
  const num = Number.isFinite(numRaw) ? Math.max(1, Math.min(10, numRaw)) : 6;

  if (q.length < 2) return badRequest("Query demasiado corta. Usa al menos 2 caracteres.");

  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!key) return NextResponse.json({ error: "Falta GOOGLE_CSE_API_KEY en .env.local" }, { status: 500 });
  if (!cx) return NextResponse.json({ error: "Falta GOOGLE_CSE_CX en .env.local" }, { status: 500 });

  const endpoint =
    "https://www.googleapis.com/customsearch/v1" +
    `?key=${encodeURIComponent(key)}` +
    `&cx=${encodeURIComponent(cx)}` +
    `&q=${encodeURIComponent(q)}` +
    `&num=${encodeURIComponent(String(num))}`;

  try {
    const r = await fetch(endpoint, { method: "GET" });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: `Custom Search API error (${r.status})`, detail: text.slice(0, 1200) },
        { status: 500 }
      );
    }

    const data = (await r.json()) as { items?: CseItem[] };
    const items = (data.items ?? [])
      .map((x): WebSearchItem | null => {
        const url = (x.link ?? "").trim();
        if (!url) return null;
        if (!isAllowedUrl(url)) return null;

        const title = (x.title ?? "").trim() || "Sin título";
        const snippet = (x.snippet ?? "").trim() || "";
        return { title, url, domain: getDomain(url), snippet };
      })
      .filter(Boolean) as WebSearchItem[];

    return NextResponse.json({
      q,
      count: items.length,
      items,
      rule: "Resultados filtrados por allowlist. Si no está en fuentes permitidas, no aparece.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Web search failed" }, { status: 500 });
  }
}
