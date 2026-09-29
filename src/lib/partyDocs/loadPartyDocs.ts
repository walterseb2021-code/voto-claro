// src/lib/partyDocs/loadPartyDocs.ts
import { promises as fs } from "fs";
import path from "path";

export type PartyDoc = {
  doc_id: string;
  title: string;

  // Estructura común (no obligatoria)
  principles?: Array<{ principle: string; keywords?: string[] }>;
  positions?: Array<{
    topic: string;
    stance: string;
    why?: string;
    how?: string[];
    keywords?: string[];
    qa_seed?: Array<string | { q: string; a: string }>;
  }>;
  strategic_axes?: any[];
  sections?: Array<{ name: string; summary: string; keywords?: string[] }>;
  qa_seed?: Array<{ q: string; a: string }>;
  keywords?: string[];
  gaps_detected?: string[];

  // Permitir campos extra sin romper tipado
  [key: string]: any;
};

let _cache: { loadedAt: number; partyId: string; docs: PartyDoc[] } | null = null;

// Cache (ms). Si luego quieres, lo subimos a 5 min.
const CACHE_TTL_MS = 60_000;
const PARTY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Carga todos los JSON oficiales del partido desde:
 * /public/party/<partyId>/docs/*.json
 *
 * - No rompe si un JSON falla: lo ignora y registra el error.
 * - Cachea en memoria para evitar lecturas repetidas.
 * - Ordena por title para estabilidad.
 */
export async function loadPartyDocsFromPublic(
  partyId = "perufederal"
): Promise<PartyDoc[]> {
  const normalizedPartyId = String(partyId ?? "").trim().toLowerCase();

  if (!PARTY_ID_RE.test(normalizedPartyId)) {
    return [];
  }

  // Cache simple en memoria (server) para no leer disco en cada request
 if (
  _cache &&
  _cache.partyId === normalizedPartyId &&
  Date.now() - _cache.loadedAt < CACHE_TTL_MS
) {
  return _cache.docs;
}

  const partyRoot = path.resolve(process.cwd(), "public", "party");
  const baseDir = path.resolve(partyRoot, normalizedPartyId, "docs");

  if (!baseDir.startsWith(`${partyRoot}${path.sep}`)) {
    return [];
  }

  let files: string[] = [];
  try {
    files = await fs.readdir(baseDir);
  } catch (e) {
    // Si la carpeta no existe o Vercel no la ve, devolvemos vacío (sin romper)
    _cache = { loadedAt: Date.now(), partyId: normalizedPartyId, docs: [] };
    return [];
  }

  const jsonFiles = files
    .filter((f) => f.toLowerCase().endsWith(".json"))
    // Orden estable para evitar cambios raros entre deploys
    .sort((a, b) => a.localeCompare(b));

  const docs: PartyDoc[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  for (const file of jsonFiles) {
    const fullPath = path.join(baseDir, file);

    let raw = "";
    try {
      raw = await fs.readFile(fullPath, "utf8");
    } catch (e: any) {
      errors.push({
        file,
        error: `readFile failed: ${String(e?.message || e)}`
      });
      continue;
    }

    try {
      const parsed = JSON.parse(raw);

      // Validación mínima (obligatoria)
      if (!parsed?.doc_id || !parsed?.title) {
        errors.push({
          file,
          error: "missing required fields: doc_id/title"
        });
        continue;
      }

      docs.push(parsed as PartyDoc);
    } catch (e: any) {
      errors.push({
        file,
        error: `JSON.parse failed: ${String(e?.message || e)}`
      });
    }
  }

  // Orden final estable por título (mejor UX de depuración)
  docs.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  // Log de depuración (solo server). No rompe en producción.
  // Si no quieres logs, lo quitamos.
  if (errors.length > 0) {
    console.warn(
      `[partyDocs] ${errors.length} JSON file(s) invalid in ${baseDir}`,
      errors
    );
  }

  _cache = { loadedAt: Date.now(), partyId: normalizedPartyId, docs };
  return docs;
}

/**
 * Limpia cache manualmente si luego quieres recargar sin esperar TTL.
 * (Útil en dev)
 */
export function clearPartyDocsCache() {
  _cache = null;
}
