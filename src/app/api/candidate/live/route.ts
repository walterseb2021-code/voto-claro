import { NextResponse, type NextRequest } from "next/server";
import { isIP } from "net";
import {
  getCandidatePanelAdminClient,
  validateCandidatePanelSession,
} from "@/lib/candidatePanelAuth";
import {
  isAllowedCandidatePanelMutationOrigin,
  isJsonContentType,
} from "@/lib/candidatePanelOrigin";

export const runtime = "nodejs";

const LIVE_PLATFORMS = new Set(["YOUTUBE", "FACEBOOK", "TIKTOK", "OTRA"]);
const LIVE_BODY_KEYS = new Set(["platform", "url", "setAsLive"]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com"]);

type LiveStatus = "LIVE" | "ENDED";

type LiveRow = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  platform: string;
  url: string;
  status: LiveStatus;
  created_at: string;
};

type LiveBody = {
  platform?: unknown;
  url?: unknown;
  setAsLive?: unknown;
};

type SessionIdentity = {
  candidateId: string;
  storageCandidateId: string;
  candidateName: string;
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
}

function badRequest() {
  return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
}

function unavailable() {
  return NextResponse.json({ ok: false, error: "No disponible." }, { status: 503 });
}

function mapLive(row: LiveRow, session: SessionIdentity) {
  return {
    id: String(row.id),
    candidateId: session.candidateId,
    candidateName: session.candidateName,
    platform: row.platform,
    url: String(row.url),
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isPrivateIpv6(hostname: string) {
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return clean === "::1" || clean.startsWith("fc") || clean.startsWith("fd") || clean.startsWith("fe80");
}

function parseLiveUrl(platform: string, value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    if (url.username || url.password) return null;

    const hostname = url.hostname.toLowerCase();

    if (platform === "YOUTUBE" && !YOUTUBE_HOSTS.has(hostname)) return null;
    if (platform === "FACEBOOK" && !FACEBOOK_HOSTS.has(hostname)) return null;
    if (platform === "TIKTOK" && !TIKTOK_HOSTS.has(hostname)) return null;

    if (platform === "OTRA") {
      const hostForIp = hostname.replace(/^\[|\]$/g, "");
      const ipVersion = isIP(hostForIp);
      if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        (ipVersion === 0 && !hostname.includes("."))
      ) {
        return null;
      }

      if (ipVersion === 4 && isPrivateIpv4(hostForIp)) return null;
      if (ipVersion === 6 && isPrivateIpv6(hostForIp)) return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await validateCandidatePanelSession(req);
  if (!session.ok) return unauthorized();

  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("votoclaro_live_entries")
    .select("id,candidate_id,candidate_name,platform,url,status,created_at")
    .eq("candidate_id", session.storageCandidateId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("[candidate-live] list failed", error.message);
    return unavailable();
  }

  return NextResponse.json({
    ok: true,
    entries: ((data ?? []) as LiveRow[]).map((row) => mapLive(row, session)),
  });
}

export async function POST(req: NextRequest) {
  if (!isAllowedCandidatePanelMutationOrigin(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  if (!isJsonContentType(req)) return badRequest();

  const session = await validateCandidatePanelSession(req);
  if (!session.ok) return unauthorized();

  let body: LiveBody;
  try {
    body = (await req.json()) as LiveBody;
  } catch {
    return badRequest();
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !LIVE_BODY_KEYS.has(key))
  ) {
    return badRequest();
  }

  const platform = String(body.platform ?? "").trim().toUpperCase();
  const url = parseLiveUrl(platform, body.url);
  const setAsLive = body.setAsLive !== false;

  if (!LIVE_PLATFORMS.has(platform) || !url) return badRequest();

  const supabase = getCandidatePanelAdminClient();
  const now = new Date().toISOString();
  const status: LiveStatus = setAsLive ? "LIVE" : "ENDED";

  if (setAsLive) {
    const { data, error } = await supabase.rpc("create_candidate_live_entry", {
      p_candidate_id: session.storageCandidateId,
      p_candidate_name: session.candidateName,
      p_platform: platform,
      p_url: url,
    });

    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      console.error("[candidate-live] create live rpc failed", error?.message);
      return unavailable();
    }

    return NextResponse.json({ ok: true, entry: mapLive(row as LiveRow, session) });
  }

  const { data, error } = await supabase
    .from("votoclaro_live_entries")
    .insert({
      candidate_id: session.storageCandidateId,
      candidate_name: session.candidateName,
      platform,
      url,
      status,
      created_at: now,
    })
    .select("id,candidate_id,candidate_name,platform,url,status,created_at")
    .single();

  if (error || !data) {
    console.error("[candidate-live] create failed", error?.message);
    return unavailable();
  }

  return NextResponse.json({ ok: true, entry: mapLive(data as LiveRow, session) });
}
