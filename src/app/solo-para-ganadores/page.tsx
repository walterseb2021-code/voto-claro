// src/app/solo-para-ganadores/page.tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

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

type PublicLegacyGroup = {
  winners: PublicWinner[];
  media: PublicMedia[];
};

type PublicSoloGanadoresPayload = {
  ok: true;
  featuredEventId: string | null;
  events: PublicEventGroup[];
  legacy: PublicLegacyGroup;
};

type MediaDisplayKind = "youtube" | "video" | "image" | "link";

type JsonRecord = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

const EMPTY_LEGACY: PublicLegacyGroup = { winners: [], media: [] };
const EMPTY_GROUPS: PublicEventGroup[] = [];

const wrap =
  "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
const sectionWrap =
  "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
const inner = "rounded-2xl border-2 border-red-600 bg-white/90 p-4";
const card = "rounded-2xl border-2 border-red-600 bg-white/90 p-5 shadow-sm";
const btn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
  "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
  "hover:bg-green-900 transition shadow-sm";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableString(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function nullableUuid(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T | null) {
  if (!Array.isArray(value)) return null;

  const items: T[] = [];
  for (const item of value) {
    const parsed = parser(item);
    if (!parsed) return null;
    items.push(parsed);
  }

  return items;
}

function parsePublicEvent(value: unknown): PublicEvent | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id);
  const title = requiredString(value.title);
  const semester = nullableString(value.semester);
  const eventDate = nullableString(value.event_date);
  const locationName = nullableString(value.location_name);
  const address = nullableString(value.address);
  const city = nullableString(value.city);
  const description = nullableString(value.description);
  const recognitions = nullableString(value.recognitions);
  const mainImageUrl = nullableString(value.main_image_url);
  const promoVideoUrl = nullableString(value.promo_video_url);
  const status = requiredString(value.status);

  if (
    !id ||
    !UUID_RE.test(id) ||
    !title ||
    semester === undefined ||
    eventDate === undefined ||
    locationName === undefined ||
    address === undefined ||
    city === undefined ||
    description === undefined ||
    recognitions === undefined ||
    mainImageUrl === undefined ||
    promoVideoUrl === undefined ||
    !status ||
    typeof value.featured !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    title,
    semester,
    event_date: eventDate,
    location_name: locationName,
    address,
    city,
    description,
    recognitions,
    main_image_url: mainImageUrl,
    promo_video_url: promoVideoUrl,
    status,
    featured: value.featured,
  };
}

function parsePublicWinner(value: unknown): PublicWinner | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id);
  const eventId = nullableUuid(value.event_id);
  const sourceModule = requiredString(value.source_module);
  const winnerName = nullableString(value.winner_name);
  const winnerAlias = nullableString(value.winner_alias);
  const title = requiredString(value.title);
  const prizeName = nullableString(value.prize_name);
  const description = nullableString(value.description);
  const photoUrl = nullableString(value.photo_url);
  const videoUrl = nullableString(value.video_url);
  const interviewUrl = nullableString(value.interview_url);
  const eventDate = nullableString(value.event_date);

  if (
    !id ||
    !UUID_RE.test(id) ||
    eventId === undefined ||
    !sourceModule ||
    winnerName === undefined ||
    winnerAlias === undefined ||
    !title ||
    prizeName === undefined ||
    description === undefined ||
    photoUrl === undefined ||
    videoUrl === undefined ||
    interviewUrl === undefined ||
    eventDate === undefined ||
    typeof value.featured !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    event_id: eventId,
    source_module: sourceModule,
    winner_name: winnerName,
    winner_alias: winnerAlias,
    title,
    prize_name: prizeName,
    description,
    photo_url: photoUrl,
    video_url: videoUrl,
    interview_url: interviewUrl,
    event_date: eventDate,
    featured: value.featured,
  };
}

function parsePublicRelatedWinner(value: unknown): PublicRelatedWinner | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id);
  const title = requiredString(value.title);
  const winnerName = nullableString(value.winner_name);
  const winnerAlias = nullableString(value.winner_alias);

  if (
    !id ||
    !UUID_RE.test(id) ||
    !title ||
    winnerName === undefined ||
    winnerAlias === undefined
  ) {
    return null;
  }

  return {
    id,
    title,
    winner_name: winnerName,
    winner_alias: winnerAlias,
  };
}

function parsePublicMedia(value: unknown): PublicMedia | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id);
  const eventId = nullableUuid(value.event_id);
  const title = requiredString(value.title);
  const mediaType = requiredString(value.media_type);
  const mediaUrl = requiredString(value.media_url);
  const description = nullableString(value.description);
  const relatedWinnerId = nullableUuid(value.related_winner_id);
  let relatedWinner: PublicRelatedWinner | null = null;
  if (value.related_winner !== null) {
    relatedWinner = parsePublicRelatedWinner(value.related_winner);
    if (!relatedWinner) return null;
  }

  if (
    !id ||
    !UUID_RE.test(id) ||
    eventId === undefined ||
    !title ||
    !mediaType ||
    !mediaUrl ||
    description === undefined ||
    relatedWinnerId === undefined ||
    (relatedWinnerId === null) !== (relatedWinner === null) ||
    (relatedWinner !== null && relatedWinner.id !== relatedWinnerId) ||
    typeof value.featured !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    event_id: eventId,
    title,
    media_type: mediaType,
    media_url: mediaUrl,
    description,
    featured: value.featured,
    related_winner_id: relatedWinnerId,
    related_winner: relatedWinner,
  };
}

function parsePublicEventGroup(value: unknown): PublicEventGroup | null {
  if (!isRecord(value)) return null;

  const event = parsePublicEvent(value.event);
  const winners = parseArray(value.winners, parsePublicWinner);
  const media = parseArray(value.media, parsePublicMedia);

  if (!event || !winners || !media) return null;

  return { event, winners, media };
}

function parsePublicLegacyGroup(value: unknown): PublicLegacyGroup | null {
  if (!isRecord(value)) return null;

  const winners = parseArray(value.winners, parsePublicWinner);
  const media = parseArray(value.media, parsePublicMedia);

  if (!winners || !media) return null;

  return { winners, media };
}

function parsePublicSoloGanadoresPayload(value: unknown): PublicSoloGanadoresPayload | null {
  if (!isRecord(value) || value.ok !== true) return null;

  const featuredEventId = nullableUuid(value.featuredEventId);
  const events = parseArray(value.events, parsePublicEventGroup);
  const legacy = parsePublicLegacyGroup(value.legacy);

  if (featuredEventId === undefined || !events || !legacy) return null;

  return {
    ok: true,
    featuredEventId,
    events,
    legacy,
  };
}

function formatDate(value: string | null) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  const dateOnly = clean.match(DATE_ONLY_RE);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function dateOrSemester(event: PublicEvent) {
  return formatDate(event.event_date) || event.semester || "";
}

function sourceLabel(source: string) {
  const key = String(source || "").trim();

  if (key === "reto_ciudadano") return "Reto Ciudadano";
  if (key === "comentarios_ciudadanos") return "Comentarios Ciudadanos";
  if (key === "proyecto_ciudadano") return "Proyecto Ciudadano";
  if (key === "espacio_emprendedor") return "Espacio Emprendedor";
  if (key === "intencion_de_voto") return "Intencion de voto";

  return "Voto Claro";
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function safeYoutubeId(value: string | null) {
  const clean = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(clean) ? clean : "";
}

function youtubeEmbedUrl(url: string) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return "";

    const hostname = parsed.hostname.toLowerCase();
    const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
    const shortHosts = new Set(["youtu.be", "www.youtu.be"]);

    if (youtubeHosts.has(hostname)) {
      if (parsed.pathname === "/watch") {
        const id = safeYoutubeId(parsed.searchParams.get("v"));
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        const id = safeYoutubeId(parsed.pathname.replace("/shorts/", "").split("/")[0]);
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }

      if (parsed.pathname.startsWith("/embed/")) {
        const id = safeYoutubeId(parsed.pathname.replace("/embed/", "").split("/")[0]);
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }
    }

    if (shortHosts.has(hostname)) {
      const id = safeYoutubeId(parsed.pathname.replace("/", "").split("/")[0]);
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
  } catch {
    return "";
  }

  return "";
}

function isDirectVideoUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return path.endsWith(".mp4") || path.endsWith(".webm") || path.endsWith(".mov");
  } catch {
    const clean = String(url || "").toLowerCase();
    return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mov");
  }
}

function isImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.endsWith(".jpg") ||
      path.endsWith(".jpeg") ||
      path.endsWith(".png") ||
      path.endsWith(".webp") ||
      path.endsWith(".gif") ||
      path.includes("/storage/v1/object/public/")
    );
  } catch {
    const clean = String(url || "").toLowerCase();
    return (
      clean.endsWith(".jpg") ||
      clean.endsWith(".jpeg") ||
      clean.endsWith(".png") ||
      clean.endsWith(".webp") ||
      clean.endsWith(".gif")
    );
  }
}

function mediaKind(url: string, type?: string | null): MediaDisplayKind {
  const mediaType = String(type || "").toLowerCase();
  const clean = String(url || "").trim();

  if (youtubeEmbedUrl(clean)) return "youtube";
  if (isDirectVideoUrl(clean)) return "video";
  if (mediaType.includes("video") || mediaType.includes("entrevista")) return "video";
  if (isImageUrl(clean)) return "image";

  return "link";
}

function recognitionLines(value: string | null) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function winnerDisplayName(winner: PublicWinner | PublicRelatedWinner) {
  return winner.winner_alias || winner.winner_name || winner.title;
}

function SafeExternalLink({
  href,
  children,
  className,
}: {
  href: string | null;
  children: ReactNode;
  className: string;
}) {
  const clean = String(href || "").trim();
  if (!clean || !isSafeHttpUrl(clean)) return null;

  return (
    <a href={clean} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function PublicMediaBox({
  url,
  title,
  type,
  emptyText = "Imagen o video por publicar.",
  variant = "large",
  imageLoading = "lazy",
}: {
  url: string | null;
  title: string;
  type?: string | null;
  emptyText?: string;
  variant?: "large" | "compact";
  imageLoading?: "lazy" | "eager";
}) {
  const clean = String(url || "").trim();
  const [failed, setFailed] = useState(false);
  const isCompact = variant === "compact";
  const radiusClass = isCompact ? "rounded-xl" : "rounded-2xl";
  const sizeClass = isCompact ? "h-full w-full" : "h-full min-h-[220px] w-full";

  if (!clean || failed) {
    return (
      <div
        className={`${sizeClass} ${radiusClass} border border-slate-300 bg-slate-50 flex items-center justify-center p-5 text-center text-sm font-semibold text-slate-600`}
      >
        {emptyText}
      </div>
    );
  }

  const kind = mediaKind(clean, type);
  const embed = youtubeEmbedUrl(clean);

  if (kind === "youtube" && embed) {
    return (
      <iframe
        src={embed}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className={`${sizeClass} ${radiusClass} border border-slate-300 bg-black`}
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  if (kind === "video" && isSafeHttpUrl(clean)) {
    return (
      <video
        src={clean}
        controls
        preload="metadata"
        className={`${sizeClass} ${radiusClass} border border-slate-300 bg-black object-contain`}
        onError={() => setFailed(true)}
      />
    );
  }

  if (kind === "image" && isSafeHttpUrl(clean)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={clean}
        alt={title}
        loading={imageLoading}
        className={`${sizeClass} ${radiusClass} border border-slate-300 bg-slate-50 object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${radiusClass} border border-slate-300 bg-slate-50 flex items-center justify-center p-5 text-center`}
    >
      <SafeExternalLink
        href={clean}
        className="text-sm font-extrabold text-green-800 underline break-all"
      >
        Abrir contenido
      </SafeExternalLink>
    </div>
  );
}

function WinnerCard({ winner }: { winner: PublicWinner }) {
  const winnerDate = formatDate(winner.event_date);

  return (
    <article className={card}>
      <div className="h-32 sm:h-36 overflow-hidden rounded-xl bg-slate-100">
        {winner.photo_url ? (
          <PublicMediaBox
            url={winner.photo_url}
            title={winner.title}
            type="foto"
            emptyText="Imagen del ganador por publicar."
            variant="compact"
          />
        ) : winner.video_url ? (
          <PublicMediaBox
            url={winner.video_url}
            title={winner.title}
            type="video"
            emptyText="Video del ganador por publicar."
            variant="compact"
          />
        ) : (
          <div className="h-full rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center">
            <div className="text-4xl" aria-hidden="true">
              Trofeo
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 text-xs font-extrabold text-green-800">
        {sourceLabel(winner.source_module)}
      </div>

      <h4 className="mt-1 text-base font-extrabold text-slate-900">{winner.title}</h4>

      <div className="mt-1 text-sm font-semibold text-slate-700">
        {winnerDisplayName(winner)}
      </div>

      {winner.prize_name ? (
        <div className="mt-2 text-xs font-bold text-slate-700">
          Premio: {winner.prize_name}
        </div>
      ) : null}

      {winnerDate ? <div className="mt-1 text-xs text-slate-600">{winnerDate}</div> : null}

      {winner.description ? (
        <p className="mt-3 text-sm text-slate-700 leading-relaxed">{winner.description}</p>
      ) : null}

      <SafeExternalLink
        href={winner.video_url}
        className="mt-3 inline-flex text-xs font-extrabold text-green-800 underline"
      >
        Ver video
      </SafeExternalLink>

      <SafeExternalLink
        href={winner.interview_url}
        className="mt-2 block text-xs font-extrabold text-green-800 underline"
      >
        Ver entrevista
      </SafeExternalLink>
    </article>
  );
}

function MediaCard({ item }: { item: PublicMedia }) {
  const relatedName = item.related_winner ? winnerDisplayName(item.related_winner) : "";

  return (
    <article className="rounded-2xl border border-slate-300 bg-white overflow-hidden shadow-sm">
      <div className="h-32 sm:h-36 bg-slate-100 overflow-hidden">
        <PublicMediaBox
          url={item.media_url}
          title={item.title}
          type={item.media_type}
          emptyText="Contenido no disponible."
          variant="compact"
        />
      </div>

      <div className="p-3">
        <div className="text-xs font-extrabold text-green-800 uppercase">
          {item.media_type}
        </div>
        <h4 className="mt-1 text-sm font-extrabold text-slate-900">{item.title}</h4>
        {relatedName ? (
          <p className="mt-1 text-xs font-bold text-slate-700">
            Relacionado con: {relatedName}
          </p>
        ) : null}
        {item.description ? (
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{item.description}</p>
        ) : null}

        {mediaKind(item.media_url, item.media_type) === "link" ? (
          <SafeExternalLink
            href={item.media_url}
            className="mt-2 inline-flex text-xs font-extrabold text-green-800 underline"
          >
            Abrir contenido
          </SafeExternalLink>
        ) : null}
      </div>
    </article>
  );
}

function WinnersGrid({ winners }: { winners: PublicWinner[] }) {
  if (!winners.length) {
    return (
      <p className="mt-2 text-sm text-slate-700">
        Todavía no hay ganadores publicados para este evento.
      </p>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {winners.map((winner) => (
        <WinnerCard key={winner.id} winner={winner} />
      ))}
    </div>
  );
}

function MediaGrid({ media }: { media: PublicMedia[] }) {
  if (!media.length) {
    return (
      <p className="mt-2 text-sm text-slate-700">
        Todavía no hay contenido de galería publicado para este evento.
      </p>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {media.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function EventPublicSection({
  group,
  variant,
}: {
  group: PublicEventGroup;
  variant: "featured" | "archive";
}) {
  const event = group.event;
  const eventDate = formatDate(event.event_date);
  const recognitions = recognitionLines(event.recognitions);
  const isFeatured = variant === "featured";

  return (
    <div className={isFeatured ? "" : "pt-3"}>
      <div className={isFeatured ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>
        <div>
          {isFeatured ? (
            <div className="mb-2 inline-flex rounded-full border border-green-800 px-3 py-1 text-xs font-extrabold text-green-800">
              Evento destacado
            </div>
          ) : null}

          {isFeatured ? (
            <h2 className="text-xl font-extrabold text-slate-900">{event.title}</h2>
          ) : (
            <h3 className="text-lg font-extrabold text-slate-900">{event.title}</h3>
          )}

          {event.semester ? (
            <div className="mt-2 text-sm font-semibold text-slate-700">
              Semestre: {event.semester}
            </div>
          ) : null}

          {eventDate ? (
            <div className="mt-1 text-sm text-slate-700">Fecha: {eventDate}</div>
          ) : null}

          {event.location_name ? (
            <div className="mt-1 text-sm text-slate-700">
              Lugar: {event.location_name}
            </div>
          ) : null}

          {event.city ? (
            <div className="mt-1 text-sm text-slate-700">Ciudad: {event.city}</div>
          ) : null}

          {event.address ? (
            <div className="mt-1 text-sm text-slate-700">Direccion: {event.address}</div>
          ) : null}

          {event.description ? (
            <p className="mt-4 text-sm text-slate-700 leading-relaxed">
              {event.description}
            </p>
          ) : null}

          {recognitions.length ? (
            <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
              <b>Reconocimientos:</b>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {recognitions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {event.main_image_url ? (
            <div className="min-h-[220px]">
              <div className="mb-1 text-xs font-extrabold text-slate-700">
                Imagen principal
              </div>
              <PublicMediaBox
                url={event.main_image_url}
                title={`${event.title} - imagen principal`}
                type="foto"
                emptyText="Imagen principal por publicar."
                imageLoading={isFeatured ? "eager" : "lazy"}
              />
            </div>
          ) : null}

          {event.promo_video_url ? (
            <div className="min-h-[220px]">
              <div className="mb-1 text-xs font-extrabold text-slate-700">
                Video promocional
              </div>
              <PublicMediaBox
                url={event.promo_video_url}
                title={`${event.title} - video promocional`}
                type="video"
                emptyText="Video del evento por publicar."
              />
            </div>
          ) : null}

          {!event.main_image_url && !event.promo_video_url ? (
            <PublicMediaBox
              url={null}
              title={event.title}
              type="foto"
              emptyText="Imagen o video del evento por publicar."
            />
          ) : null}
        </div>
      </div>

      <section className="mt-6">
        <h3 className="text-lg font-extrabold text-slate-900">Ganadores del evento</h3>
        <WinnersGrid winners={group.winners} />
      </section>

      <section className="mt-6">
        <h3 className="text-lg font-extrabold text-slate-900">Galeria del evento</h3>
        <MediaGrid media={group.media} />
      </section>
    </div>
  );
}

function archiveSummary(group: PublicEventGroup) {
  const date = dateOrSemester(group.event);
  const winnersLabel =
    group.winners.length === 1 ? "1 ganador" : `${group.winners.length} ganadores`;
  const mediaLabel =
    group.media.length === 1 ? "1 recuerdo" : `${group.media.length} recuerdos`;

  return [group.event.title, date, winnersLabel, mediaLabel].filter(Boolean).join(" - ");
}

function containsVideoOrInterview(groups: PublicEventGroup[], legacy: PublicLegacyGroup) {
  const groupedMedia = groups.flatMap((group) => group.media);
  const allMedia = [...groupedMedia, ...legacy.media];
  return allMedia.some((item) =>
    ["video", "entrevista"].includes(String(item.media_type || "").toLowerCase())
  );
}

export default function SoloParaGanadoresPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [payload, setPayload] = useState<PublicSoloGanadoresPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const groups = payload?.events ?? EMPTY_GROUPS;
  const legacy = payload?.legacy ?? EMPTY_LEGACY;
  const featuredEventId = payload?.featuredEventId ?? null;
  const featuredGroup =
    groups.find((group) => group.event.id === featuredEventId) ?? groups[0] ?? null;
  const archiveGroups = featuredGroup
    ? groups.filter((group) => group.event.id !== featuredGroup.event.id)
    : groups;
  const hasLegacy = legacy.winners.length > 0 || legacy.media.length > 0;
  const hasAnyContent = groups.length > 0 || hasLegacy;
  const winnersCount =
    groups.reduce((total, group) => total + group.winners.length, 0) +
    legacy.winners.length;
  const mediaCount =
    groups.reduce((total, group) => total + group.media.length, 0) + legacy.media.length;
  const hasVideosOrInterviews = containsVideoOrInterview(groups, legacy);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      setLoading(true);
      setLoadError("");

      try {
        const res = await fetch("/api/solo-ganadores/public", {
          method: "GET",
          cache: "no-store",
        });

        const raw: unknown = await res.json().catch(() => null);
        const data = parsePublicSoloGanadoresPayload(raw);

        if (!res.ok || !data) {
          throw new Error("No disponible");
        }

        if (!alive) return;

        setPayload(data);
      } catch {
        if (!alive) return;
        setPayload(null);
        setLoadError("No disponible");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setPageContext({
      pageId: "solo-para-ganadores",
      pageTitle: "Solo para ganadores",
      route: "/solo-para-ganadores",
      summary:
        "Ventana publica de reconocimiento a los ganadores de Voto Claro, organizada por eventos, premios, fotos, videos, entrevistas y entregas.",
      speakableSummary:
        "Estas en Solo para ganadores. Esta ventana reune reconocimientos, ganadores, eventos, fotos, videos, entrevistas y entregas de premios dentro de Voto Claro.",
      activeSection: "vitrina-ganadores",
      visibleText: [
        "Pantalla publica Solo para ganadores.",
        "Aqui se muestran ganadores organizados por evento.",
        "Tambien se presentan fotos, videos, entrevistas, reconocimientos y detalles de cada ceremonia.",
        featuredGroup
          ? `Evento destacado visible: ${featuredGroup.event.title}.`
          : "No hay evento destacado visible todavia.",
        `Eventos publicados visibles: ${groups.length}.`,
        `Ganadores publicados visibles: ${winnersCount}.`,
        `Elementos de galeria visibles: ${mediaCount}.`,
      ].join("\n"),
      availableActions: [
        "Ver evento destacado",
        "Ver archivo de eventos",
        "Ver ganadores por evento",
        "Ver galeria de fotos",
        "Ver videos y entrevistas",
        "Volver al inicio",
      ],
      suggestedPrompts: [
        {
          id: "ganadores-1",
          label: "Que es esto",
          question: "Que es la ventana Solo para ganadores?",
        },
        {
          id: "ganadores-2",
          label: "Ganadores",
          question: "Que ganadores aparecen en esta ventana?",
        },
        {
          id: "ganadores-3",
          label: "Evento",
          question: "Que informacion hay sobre el evento destacado?",
        },
        {
          id: "ganadores-4",
          label: "Galeria",
          question: "Que fotos, videos o entrevistas puedo ver aqui?",
        },
        {
          id: "ganadores-5",
          label: "Transparencia",
          question: "Por que esta ventana ayuda a dar transparencia a los premios?",
        },
      ],
      selectedItemTitle: "Solo para ganadores",
      status: loading ? "loading" : "ready",
      dynamicData: {
        moduloPublico: true,
        loading,
        loadError,
        eventosPublicadosCount: groups.length,
        ganadoresPublicadosCount: winnersCount,
        mediaPublicadaCount: mediaCount,
        eventoDestacadoTitulo: featuredGroup?.event.title || "",
        contieneGanadores: winnersCount > 0,
        contieneEventoDestacado: featuredGroup !== null,
        contieneGaleria: mediaCount > 0,
        contieneLegacy: hasLegacy,
        contieneVideosEntrevistas: hasVideosOrInterviews,
      },
    });

    return () => {
      clearPageContext();
    };
  }, [
    setPageContext,
    clearPageContext,
    loading,
    loadError,
    groups.length,
    winnersCount,
    mediaCount,
    featuredGroup?.event.title,
    hasLegacy,
    hasVideosOrInterviews,
  ]);

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-slate-900">
            SOLO PARA GANADORES
          </h1>
          <p className="mt-2 text-sm md:text-base font-semibold text-slate-700 max-w-3xl">
            Una vitrina publica para reconocer a los ciudadanos que participaron,
            destacaron y recibieron premios dentro de Voto Claro.
          </p>
        </div>

        <Link href="/" className={btn}>
          ← Volver al inicio
        </Link>
      </div>

      {loading ? (
        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">
              Cargando información...
            </div>
            <p className="mt-2 text-sm text-slate-700">
              Estamos consultando ganadores, eventos y galería pública.
            </p>
          </div>
        </section>
      ) : null}

      {loadError ? (
        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-red-700">
              No se pudo cargar la información.
            </div>
            <p className="mt-2 text-sm text-slate-700">{loadError}</p>
          </div>
        </section>
      ) : null}

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            <div className={card}>
              <div className="text-xl font-extrabold text-slate-900">
                Reconocimiento publico
              </div>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Aqui se reunen los ganadores de las distintas dinamicas de la
                plataforma: retos, comentarios ciudadanos, proyectos, iniciativas y
                otras actividades con premio.
              </p>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Cada reconocimiento busca mostrar una historia visible: quien participo,
                en que dinamica destaco y que premio recibio.
              </p>
            </div>

            <div className={card}>
              <div className="text-xl font-extrabold text-slate-900">
                Evidencia y memoria
              </div>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Esta ventana muestra fotos, videos, entrevistas, testimonios y momentos
                de entrega de premios.
              </p>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Asi, los usuarios pueden ver el proceso de reconocimiento y el contenido
                relacionado con cada evento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {!loading && !loadError && !hasAnyContent ? (
        <section className={sectionWrap + " mt-6"}>
          <div className={inner}>
            <p className="text-sm font-semibold text-slate-700">
              Todavía no hay reconocimientos públicos disponibles.
            </p>
          </div>
        </section>
      ) : null}

      {featuredGroup ? (
        <section className={sectionWrap + " mt-6"}>
          <div className={inner}>
            <div className="text-lg font-extrabold text-slate-900">
              Evento destacado
            </div>
            <div className="mt-4">
              <EventPublicSection group={featuredGroup} variant="featured" />
            </div>
          </div>
        </section>
      ) : null}

      {archiveGroups.length ? (
        <section className={sectionWrap + " mt-6"}>
          <div className={inner}>
            <h2 className="text-lg font-extrabold text-slate-900">Archivo de eventos</h2>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">
              Consulta los reconocimientos, ganadores y recuerdos de ceremonias anteriores.
            </p>

            <div className="mt-4 space-y-3">
              {archiveGroups.map((group) => (
                <details
                  key={group.event.id}
                  className="rounded-xl border border-slate-300 bg-slate-50 p-3"
                >
                  <summary className="cursor-pointer text-sm font-extrabold text-slate-900">
                    {archiveSummary(group)}
                  </summary>
                  <EventPublicSection group={group} variant="archive" />
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {hasLegacy ? (
        <section className={sectionWrap + " mt-6"}>
          <div className={inner}>
            <h2 className="text-lg font-extrabold text-slate-900">
              Reconocimientos anteriores
            </h2>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">
              Contenido publicado antes de organizar los reconocimientos por evento.
            </p>

            {legacy.winners.length ? (
              <section className="mt-5">
                <h3 className="text-base font-extrabold text-slate-900">
                  Ganadores historicos
                </h3>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {legacy.winners.map((winner) => (
                    <WinnerCard key={winner.id} winner={winner} />
                  ))}
                </div>
              </section>
            ) : null}

            {legacy.media.length ? (
              <section className="mt-6">
                <h3 className="text-base font-extrabold text-slate-900">
                  Galeria historica
                </h3>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {legacy.media.map((item) => (
                    <MediaCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}

      <footer className="mt-6 text-xs text-slate-600 leading-relaxed">
        Esta ventana muestra informacion publica de reconocimiento, evidencia de premios
        y contenido relacionado con eventos de ganadores dentro de Voto Claro.
      </footer>
    </main>
  );
}
