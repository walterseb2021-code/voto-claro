// src/lib/votoclaro/webAllowlist.ts
export const ALLOWED_DOMAINS = [
  "rpp.pe",
  "elcomercio.pe",
  "larepublica.pe",
  "idl-reporteros.pe",
  "ojo-publico.com",
  "elperuano.pe",
  "andina.pe",
  "tvperu.gob.pe",
  "radionacional.com.pe",
  "jne.gob.pe",
] as const;

export type AllowedDomain = (typeof ALLOWED_DOMAINS)[number];

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isAllowedUrl(url: string): boolean {
  const d = getDomain(url);
  return ALLOWED_DOMAINS.some((allowed) => d === allowed || d.endsWith("." + allowed));
}
