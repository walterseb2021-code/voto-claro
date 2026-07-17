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
  featured: boolean | null;
  created_at: string | null;
};

type PostDbRow = {
  id: string;
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
  title: string | null;
  media_type: string | null;
  media_url: string | null;
  description: string | null;
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
};

type PublicPost = {
  id: string;
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
};

type PublicMedia = {
  id: string;
  title: string;
  media_type: string;
  media_url: string;
  description: string | null;
};

type Selectable<T> = {
  item: T;
  featured: boolean;
};

type SanitizeStats = {
  excludedEvents: number;
  excludedPosts: number;
  excludedMedia: number;
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

function toPublicEvent(row: EventDbRow, stats: SanitizeStats): Selectable<PublicEvent> | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedEvents += 1;
    return null;
  }

  return {
    featured: row.featured === true,
    item: {
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
    },
  };
}

function toPublicPost(row: PostDbRow, stats: SanitizeStats): Selectable<PublicPost> | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedPosts += 1;
    return null;
  }

  return {
    featured: row.featured === true,
    item: {
      id: row.id,
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
    },
  };
}

function toPublicMedia(row: MediaDbRow, stats: SanitizeStats): Selectable<PublicMedia> | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedMedia += 1;
    return null;
  }

  const mediaUrl = getValidUrl(row.media_url);
  if (!mediaUrl) {
    stats.excludedMedia += 1;
    return null;
  }

  return {
    featured: row.featured === true,
    item: {
      id: row.id,
      title: row.title ?? "",
      media_type: row.media_type ?? "",
      media_url: mediaUrl,
      description: row.description ?? null,
    },
  };
}

function chooseEvent(events: Selectable<PublicEvent>[]) {
  const selected = events.find((event) => event.featured) ?? events[0] ?? null;
  return selected ? [selected.item] : [];
}

function choosePosts(posts: Selectable<PublicPost>[]) {
  const featured = posts.filter((post) => post.featured);
  return (featured.length ? featured : posts.slice(0, 6)).map((post) => post.item);
}

function chooseMedia(media: Selectable<PublicMedia>[]) {
  const featured = media.filter((item) => item.featured);
  return (featured.length ? featured : media.slice(0, 9)).map((item) => item.item);
}

function warnIfSanitized(stats: SanitizeStats) {
  if (
    stats.excludedEvents === 0 &&
    stats.excludedPosts === 0 &&
    stats.excludedMedia === 0 &&
    stats.invalidOptionalUrls === 0
  ) {
    return;
  }

  console.warn("[solo-ganadores/public] sanitized public rows", {
    events: stats.excludedEvents,
    posts: stats.excludedPosts,
    media: stats.excludedMedia,
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
          "id,title,semester,event_date,location_name,address,city,description,recognitions,main_image_url,promo_video_url,featured,created_at"
        )
        .eq("published", true)
        .order("featured", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(10),
      supabase
        .from("solo_ganadores_posts")
        .select(
          "id,source_module,winner_name,winner_alias,title,prize_name,description,photo_url,video_url,interview_url,event_date,featured,created_at"
        )
        .eq("published", true)
        .order("featured", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from("solo_ganadores_media")
        .select("id,title,media_type,media_url,description,featured,created_at")
        .eq("published", true)
        .order("featured", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(30),
    ]);

    if (eventsResult.error) {
      console.error("[solo-ganadores/public] events lookup failed", eventsResult.error);
      return json(500, { ok: false, error: "No disponible" });
    }

    if (postsResult.error) {
      console.error("[solo-ganadores/public] posts lookup failed", postsResult.error);
      return json(500, { ok: false, error: "No disponible" });
    }

    if (mediaResult.error) {
      console.error("[solo-ganadores/public] media lookup failed", mediaResult.error);
      return json(500, { ok: false, error: "No disponible" });
    }

    const stats: SanitizeStats = {
      excludedEvents: 0,
      excludedPosts: 0,
      excludedMedia: 0,
      invalidOptionalUrls: 0,
    };

    const eventRows = (eventsResult.data ?? []) as EventDbRow[];
    const postRows = (postsResult.data ?? []) as PostDbRow[];
    const mediaRows = (mediaResult.data ?? []) as MediaDbRow[];

    const events = eventRows
      .map((row) => toPublicEvent(row, stats))
      .filter((event): event is Selectable<PublicEvent> => event !== null);

    const posts = postRows
      .map((row) => toPublicPost(row, stats))
      .filter((post): post is Selectable<PublicPost> => post !== null);

    const media = mediaRows
      .map((row) => toPublicMedia(row, stats))
      .filter((item): item is Selectable<PublicMedia> => item !== null);

    warnIfSanitized(stats);

    return json(200, {
      ok: true,
      events: chooseEvent(events),
      posts: choosePosts(posts),
      media: chooseMedia(media),
    });
  } catch (error) {
    console.error("[solo-ganadores/public] unexpected error", error);
    return json(500, { ok: false, error: "No disponible" });
  }
}
