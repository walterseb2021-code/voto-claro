// src/lib/votoclaro/webSources.ts

export const ALLOWED_DOMAINS = [
  // Medios
  "rpp.pe",
  "elcomercio.pe",
  "larepublica.pe",
  "idl-reporteros.pe",
  "ojo-publico.com",
  // Estado / oficiales
  "elperuano.pe",
  "andina.pe",
  "tvperu.gob.pe",
  "radionacional.com.pe",
  "jne.gob.pe",
];

export function isAllowedUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
