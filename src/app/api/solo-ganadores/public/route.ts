import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventDbRow = {
  id: string;
  title: string | null;
  semester: string | null;
  event_date: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  recognitions: string | null;
  main_image_url: string | null;
  promo_video_url: string | null;
  status: string | null;
  featured: boolean | null;
  created_at: string | null;
};

type PostDbRow = {
  id: string;
  event_id: string | null;
  source_module: string | null;
  winner_name: string | null;
  winner_alias: string | null;
  title: string | null;
  prize_name: string | null;
  description: string | null;
  photo_url: string | null;
  video_url: string | null;
  interview_url: string | null;
  event_date: string | null;
  featured: boolean | null;
  created_at: string | null;
};

type MediaDbRow = {
  id: string;
  event_id: string | null;
  title: string | null;
  media_type: string | null;
  media_url: string | null;
  description: string | null;
  related_winner_id: string | null;
  featured: boolean | null;
  created_at: string | null;
};

type PublicEvent = {
  id: string;
  title: string;
  semester: string | null;
  event_date: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  recognitions: string | null;
  main_image_url: string | null;
  promo_video_url: string | null;
  status: string;
  featured: boolean;
};

type PublicWinner = {
  id: string;
  event_id: string | null;
  source_module: string;
  winner_name: string | null;
  winner_alias: string | null;
  title: string;
  prize_name: string | null;
  description: string | null;
  photo_url: string | null;
  video_url: string | null;
  interview_url: string | null;
  event_date: string | null;
  featured: boolean;
};

type PublicRelatedWinner = {
  id: string;
  title: string;
  winner_name: string | null;
  winner_alias: string | null;
};

type PublicMedia = {
  id: string;
  event_id: string | null;
  title: string;
  media_type: string;
  media_url: string;
  description: string | null;
  featured: boolean;
  related_winner_id: string | null;
  related_winner: PublicRelatedWinner | null;
};

type PublicEventGroup = {
  event: PublicEvent;
  winners: PublicWinner[];
  media: PublicMedia[];
};

type SanitizeStats = {
  excludedEvents: number;
  excludedWinners: number;
  excludedMedia: number;
  excludedHiddenWinners: number;
  excludedHiddenMedia: number;
  invalidOptionalUrls: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase admin configuration");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getRequestOrigin(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  return new URL(req.url).origin;
}

function isLocalOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  if (process.env.NODE_ENV !== "production" && isLocalOrigin(origin)) {
    return true;
  }

  try {
    return new URL(origin).origin === getRequestOrigin(req);
  } catch {
    return false;
  }
}

function getValidUrl(value: string | null) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) return null;

  try {
    const url = new URL(clean);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return clean;
  } catch {
    return null;
  }
}

function optionalUrl(value: string | null, stats: SanitizeStats) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) return null;

  const validUrl = getValidUrl(clean);
  if (!validUrl) {
    stats.invalidOptionalUrls += 1;
    return null;
  }

  return validUrl;
}

function nullableUuid(value: string | null) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) return null;
  return UUID_RE.test(clean) ? clean : undefined;
}

function toPublicEvent(row: EventDbRow, stats: SanitizeStats): PublicEvent | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedEvents += 1;
    return null;
  }

  return {
    id: row.id,
    title: row.title ?? "",
    semester: row.semester ?? null,
    event_date: row.event_date ?? null,
    location_name: row.location_name ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    description: row.description ?? null,
    recognitions: row.recognitions ?? null,
    main_image_url: optionalUrl(row.main_image_url, stats),
    promo_video_url: optionalUrl(row.promo_video_url, stats),
    status: row.status ?? "",
    featured: row.featured === true,
  };
}

function toPublicWinner(row: PostDbRow, stats: SanitizeStats): PublicWinner | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedWinners += 1;
    return null;
  }

  const eventId = nullableUuid(row.event_id);
  if (eventId === undefined) {
    stats.excludedWinners += 1;
    return null;
  }

  return {
    id: row.id,
    event_id: eventId,
    source_module: row.source_module ?? "",
    winner_name: row.winner_name ?? null,
    winner_alias: row.winner_alias ?? null,
    title: row.title ?? "",
    prize_name: row.prize_name ?? null,
    description: row.description ?? null,
    photo_url: optionalUrl(row.photo_url, stats),
    video_url: optionalUrl(row.video_url, stats),
    interview_url: optionalUrl(row.interview_url, stats),
    event_date: row.event_date ?? null,
    featured: row.featured === true,
  };
}

function toPublicMedia(row: MediaDbRow, stats: SanitizeStats): PublicMedia | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedMedia += 1;
    return null;
  }

  const eventId = nullableUuid(row.event_id);
  if (eventId === undefined) {
    stats.excludedMedia += 1;
    return null;
  }

  const relatedWinnerId = nullableUuid(row.related_winner_id);
  if (relatedWinnerId === undefined) {
    stats.excludedMedia += 1;
    return null;
  }

  const mediaUrl = getValidUrl(row.media_url);
  if (!mediaUrl) {
    stats.excludedMedia += 1;
    return null;
  }

  return {
    id: row.id,
    event_id: eventId,
    title: row.title ?? "",
    media_type: row.media_type ?? "",
    media_url: mediaUrl,
    description: row.description ?? null,
    featured: row.featured === true,
    related_winner_id: relatedWinnerId,
    related_winner: null,
  };
}

function toRelatedWinner(winner: PublicWinner): PublicRelatedWinner {
  return {
    id: winner.id,
    title: winner.title,
    winner_name: winner.winner_name,
    winner_alias: winner.winner_alias,
  };
}

function groupPublicContent(
  events: PublicEvent[],
  winners: PublicWinner[],
  mediaItems: PublicMedia[],
  stats: SanitizeStats
) {
  const publishedEventIds = new Set(events.map((event) => event.id));
  const groups = events.map<PublicEventGroup>((event) => ({
    event,
    winners: [],
    media: [],
  }));
  const groupsByEventId = new Map(groups.map((group) => [group.event.id, group]));
  const legacy: { winners: PublicWinner[]; media: PublicMedia[] } = {
    winners: [],
    media: [],
  };
  const visibleWinnersById = new Map<string, PublicWinner>();

  for (const winner of winners) {
    if (winner.event_id === null) {
      legacy.winners.push(winner);
      visibleWinnersById.set(winner.id, winner);
      continue;
    }

    const group = groupsByEventId.get(winner.event_id);
    if (!group || !publishedEventIds.has(winner.event_id)) {
      stats.excludedHiddenWinners += 1;
      continue;
    }

    group.winners.push(winner);
    visibleWinnersById.set(winner.id, winner);
  }

  for (const mediaItem of mediaItems) {
    if (mediaItem.event_id !== null && !publishedEventIds.has(mediaItem.event_id)) {
      stats.excludedHiddenMedia += 1;
      continue;
    }

    const relatedWinner =
      mediaItem.related_winner_id === null
        ? null
        : visibleWinnersById.get(mediaItem.related_winner_id) ?? null;
    const publicMediaItem: PublicMedia =
      relatedWinner && relatedWinner.event_id === mediaItem.event_id
        ? {
            ...mediaItem,
            related_winner_id: relatedWinner.id,
            related_winner: toRelatedWinner(relatedWinner),
          }
        : {
            ...mediaItem,
            related_winner_id: null,
            related_winner: null,
          };

    if (publicMediaItem.event_id === null) {
      legacy.media.push(publicMediaItem);
      continue;
    }

    const group = groupsByEventId.get(publicMediaItem.event_id);
    if (!group) {
      stats.excludedHiddenMedia += 1;
      continue;
    }

    group.media.push(publicMediaItem);
  }

  const featuredEvent = events.find((event) => event.featured) ?? events[0] ?? null;

  return {
    featuredEventId: featuredEvent?.id ?? null,
    events: groups,
    legacy,
  };
}

function warnIfSanitized(stats: SanitizeStats) {
  if (
    stats.excludedEvents === 0 &&
    stats.excludedWinners === 0 &&
    stats.excludedMedia === 0 &&
    stats.excludedHiddenWinners === 0 &&
    stats.excludedHiddenMedia === 0 &&
    stats.invalidOptionalUrls === 0
  ) {
    return;
  }

  console.warn("[solo-ganadores/public] sanitized public rows", {
    events: stats.excludedEvents,
    winners: stats.excludedWinners,
    media: stats.excludedMedia,
    hiddenWinners: stats.excludedHiddenWinners,
    hiddenMedia: stats.excludedHiddenMedia,
    optionalUrls: stats.invalidOptionalUrls,
  });
}

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const { searchParams } = new URL(req.url);
    if (Array.from(searchParams.keys()).length > 0) {
      return json(400, { ok: false, error: "Solicitud inválida" });
    }

    const supabase = getSupabaseAdmin();

    const [eventsResult, postsResult, mediaResult] = await Promise.all([
      supabase
        .from("solo_ganadores_events")
        .select(
          "id,title,semester,event_date,location_name,address,city,description,recognitions,main_image_url,promo_video_url,status,featured,created_at"
        )
        .eq("published", true)
        .order("featured", { ascending: false, nullsFirst: false })
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("title", { ascending: true, nullsFirst: false })
        .limit(50)
        .returns<EventDbRow[]>(),
      supabase
        .from("solo_ganadores_posts")
        .select(
          "id,event_id,source_module,winner_name,winner_alias,title,prize_name,description,photo_url,video_url,interview_url,event_date,featured,created_at"
        )
        .eq("published", true)
        .order("featured", { ascending: false, nullsFirst: false })
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("title", { ascending: true, nullsFirst: false })
        .limit(500)
        .returns<PostDbRow[]>(),
      supabase
        .from("solo_ganadores_media")
        .select("id,event_id,title,media_type,media_url,description,related_winner_id,featured,created_at")
        .eq("published", true)
        .order("featured", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("title", { ascending: true, nullsFirst: false })
        .limit(500)
        .returns<MediaDbRow[]>(),
    ]);

    if (eventsResult.error) {
      console.error("[solo-ganadores/public] events lookup failed");
      return json(500, { ok: false, error: "No disponible" });
    }

    if (postsResult.error) {
      console.error("[solo-ganadores/public] winners lookup failed");
      return json(500, { ok: false, error: "No disponible" });
    }

    if (mediaResult.error) {
      console.error("[solo-ganadores/public] media lookup failed");
      return json(500, { ok: false, error: "No disponible" });
    }

    const stats: SanitizeStats = {
      excludedEvents: 0,
      excludedWinners: 0,
      excludedMedia: 0,
      excludedHiddenWinners: 0,
      excludedHiddenMedia: 0,
      invalidOptionalUrls: 0,
    };

    const eventRows = eventsResult.data ?? [];
    const postRows = postsResult.data ?? [];
    const mediaRows = mediaResult.data ?? [];

    const events = eventRows
      .map((row) => toPublicEvent(row, stats))
      .filter((event): event is PublicEvent => event !== null);

    const winners = postRows
      .map((row) => toPublicWinner(row, stats))
      .filter((winner): winner is PublicWinner => winner !== null);

    const media = mediaRows
      .map((row) => toPublicMedia(row, stats))
      .filter((item): item is PublicMedia => item !== null);

    const grouped = groupPublicContent(events, winners, media, stats);

    warnIfSanitized(stats);

    return json(200, {
      ok: true,
      featuredEventId: grouped.featuredEventId,
      events: grouped.events,
      legacy: grouped.legacy,
    });
  } catch {
    console.error("[solo-ganadores/public] unexpected error");
    return json(500, { ok: false, error: "No disponible" });
  }
}
