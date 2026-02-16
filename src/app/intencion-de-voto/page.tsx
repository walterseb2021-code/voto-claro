// src/app/intencion-de-voto/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type VoteOption = {
  id: string; // UUID (vote_parties.id)
  slug: string;
  name: string;
  enabled: boolean;
  position: number;
  total_votes: number;
};

type ActiveResponse = {
  round: { id: string; name: string; is_active: boolean; created_at: string };
  options: VoteOption[];
  meta: { options_total: number; enabled_total: number };
};

function logoSrc(slug: string) {
  return `/voto/parties/${slug}.png`;
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  return newId;
}

const MOTIVATIONAL: string[] = [
  "Un voto responsable empieza con información verificable.",
  "Decidir bien es un acto de respeto por tu futuro y el de tu familia.",
  "No sigas la bulla: sigue la evidencia.",
  "Antes de creer, contrasta. Antes de votar, verifica.",
];

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full border border-green-200 bg-green-100 text-green-800 font-medium">
      {children}
    </span>
  );
}

export default function IntencionDeVotoPage() {
  // Identidad del dispositivo (persistente)
  const [deviceId, setDeviceId] = useState<string>("");

  // Datos reales (ronda activa + opciones + tally)
  const [active, setActive] = useState<ActiveResponse | null>(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const [activeErr, setActiveErr] = useState<string | null>(null);

  // Flujo “selección editable hasta confirmar”
  const [pendingSlug, setPendingSlug] = useState<string | null>(null); // lo que el usuario va eligiendo
  const [confirmedPartyId, setConfirmedPartyId] = useState<string | null>(null); // si ya votó (party_id UUID)
  const [locked, setLocked] = useState(false);

  // UI de reflexión (solo cuando selecciona Nulo/Blanco)
  const [showReflection, setShowReflection] = useState(false);

  // Mensaje sobrio (sin alert)
  const [notice, setNotice] = useState<string | null>(null);

  // Subir
  function scrollToTop() {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  // 1) Inicializar deviceId
  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  // 2) Cargar ronda activa + opciones (tally)
  async function loadActive() {
    setLoadingActive(true);
    setActiveErr(null);
    try {
      const res = await fetch("/api/vote/active", { cache: "no-store" });
      const data = (await res.json()) as ActiveResponse;

      if (!res.ok) {
        setActive(null);
        setActiveErr((data as any)?.error ?? "Error cargando /api/vote/active");
        return;
      }

      // solo enabled, ordenados por position ya vienen así, pero filtramos por seguridad
      data.options = (data.options ?? [])
        .filter((o) => o.enabled)
        .sort((a, b) => a.position - b.position);

      setActive(data);
    } catch (e) {
      setActive(null);
      setActiveErr("Error de conexión cargando la ronda activa.");
    } finally {
      setLoadingActive(false);
    }
  }

  useEffect(() => {
    loadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) Si ya votó este device en la ronda activa, bloquear automáticamente
  useEffect(() => {
    async function checkStatus() {
      if (!deviceId) return;
      if (!active?.round?.id) return;

      try {
        const res = await fetch(`/api/vote/status?device_id=${encodeURIComponent(deviceId)}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (res.ok && data?.voted && data?.party_id) {
          setConfirmedPartyId(String(data.party_id));
          setLocked(true);
          setNotice("Tu intención de voto ya quedó registrada en esta encuesta.");
        }
      } catch {
        // silencio: no bloqueamos por errores de red
      }
    }

    checkStatus();
  }, [deviceId, active?.round?.id]);

  // Derivados
  const total = useMemo(() => {
    const opts = active?.options ?? [];
    return opts.reduce((acc, o) => acc + (o.total_votes ?? 0), 0);
  }, [active?.options]);

  const quote = useMemo(() => {
    const idx = Math.abs(total) % MOTIVATIONAL.length;
    return MOTIVATIONAL[idx];
  }, [total]);

  // Selección editable (NO guarda en Supabase)
  function voteSelect(slug: string) {
    if (locked) return;

    setPendingSlug(slug);
    setNotice(null);

    if (slug === "nulo-blanco") {
      setShowReflection(true);
    } else {
      setShowReflection(false);
    }
  }

  // Confirmación (recién aquí se guarda en Supabase)
  async function confirmVote() {
    if (locked) return;
    if (!deviceId) return;
    if (!pendingSlug) {
      setNotice("Selecciona una opción antes de confirmar.");
      return;
    }

    setNotice("Registrando tu intención de voto…");

    try {
      const res = await fetch("/api/vote/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          device_id: deviceId,
          party_slug: pendingSlug,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // 409 = ya votó (UNIQUE)
        setNotice(data?.error ?? "No se pudo registrar el voto.");
        if (res.status === 409) {
          // nos aseguramos de bloquear y refrescar status
          setLocked(true);
        }
        return;
      }

      // OK
      setLocked(true);
      setConfirmedPartyId(String(data?.party?.id ?? ""));
      setNotice("Listo. Tu intención de voto quedó registrada.");
      if (pendingSlug === "nulo-blanco") setShowReflection(true);

      // refrescar tally real
      await loadActive();
    } catch (e) {
      setNotice("Error de conexión. Intenta nuevamente.");
    }
  }

  // Para resaltar el “voto confirmado”, convertimos party_id -> slug usando options
  const confirmedSlug = useMemo(() => {
    if (!confirmedPartyId) return null;
    const opt = (active?.options ?? []).find((o) => o.id === confirmedPartyId);
    return opt?.slug ?? null;
  }, [confirmedPartyId, active?.options]);

  return (
   <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100">
  <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">

      {/* HEADER */}
      <section className="rounded-3xl border-[6px] border-red-600 shadow-sm overflow-hidden bg-white">
        <div className="p-6 md:p-8 bg-gradient-to-br from-sky-50 via-white to-white">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                  Intención de voto
                </h1>

                <p className="mt-2 text-sm md:text-base text-slate-800">
                  Selecciona tu opción y luego presiona <b>Confirmar</b>. Después de confirmar, no podrás cambiar.
                </p>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Pill>Editable hasta confirmar</Pill>
                  <Pill>1 voto por dispositivo</Pill>
                </div>

                <div className="mt-4 text-sm text-slate-900">
                  <span className="inline-block rounded-lg bg-green-100 px-3 py-2 border-2 border-red-500">
                    “{quote}”
                  </span>
                </div>

                <div className="mt-4 text-xs text-slate-700">
                  Total registrado en esta encuesta: <b>{total}</b>
                </div>

                {notice ? (
                  <div className="mt-4 text-sm text-slate-900">
                    <div className="inline-block rounded-xl bg-green-50 border-2 border-red-500 px-4 py-2">
                      {notice}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 shadow-sm transition"
                >
                  ← Volver al inicio
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GRID */}
      <section className="mt-6 border-[6px] border-red-600 rounded-2xl p-6 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="inline-block rounded-lg bg-green-100 px-3 py-1 text-lg font-semibold text-slate-900 border-2 border-red-500">
              Elige una opción
            </h2>
            <p className="text-sm text-slate-800 mt-1">
              Tocar una tarjeta <b>solo selecciona</b>. El registro real ocurre al presionar <b>Confirmar</b>.
            </p>
          </div>

          <div className="text-xs text-slate-800 border border-green-200 rounded-full px-3 py-1 bg-green-50">
            Estado:{" "}
            {locked ? <b>confirmado</b> : pendingSlug ? <b>selección pendiente</b> : <b>sin selección</b>}
          </div>
        </div>

        {loadingActive ? (
          <div className="mt-6 text-sm text-slate-700">Cargando opciones…</div>
        ) : activeErr ? (
          <div className="mt-6 text-sm text-red-700">{activeErr}</div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(active?.options ?? []).map((opt) => {
                const isSelected = pendingSlug === opt.slug;
                const isConfirmed = confirmedSlug === opt.slug;
                const isBlank = opt.slug === "nulo-blanco";

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => voteSelect(opt.slug)}
                    disabled={locked}
                    className={[
                      "text-left w-full rounded-2xl border-[6px] p-4 shadow-sm transition",
                      "border-red-600",
                      locked ? "opacity-95" : "hover:shadow-md",
                      isSelected
                        ? "bg-green-100"
                        : isBlank
                        ? "bg-green-50 hover:bg-green-100"
                        : "bg-white hover:bg-slate-50",
                      isConfirmed ? "ring-2 ring-green-400" : "",
                    ].join(" ")}
                    aria-label={`Seleccionar ${opt.name}`}
                    title={opt.slug}
                  >
                    <div className="flex flex-col items-center text-center">
                      {/* LOGO GRANDE ARRIBA */}
                      <div
                        className={[
                          "w-full h-24 rounded-xl flex items-center justify-center mb-3 overflow-hidden",
                          isBlank ? "bg-green-200" : "bg-slate-50",
                        ].join(" ")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoSrc(opt.slug)}
                          alt={opt.name}
                          className="h-full w-full object-contain object-top p-2"
                          draggable={false}
                        />
                      </div>

                      {/* NOMBRE */}
                      <div className="font-semibold text-slate-900 leading-tight">{opt.name}</div>

                      {/* CONTADOR (derecha) */}
                      <div className="mt-2 w-full flex justify-end">
                        <div className="text-sm font-extrabold text-slate-900">{opt.total_votes ?? 0}</div>
                      </div>

                      {/* TEXTO */}
                      <div className="mt-2 text-[11px] text-slate-700">
                        {locked
                          ? isConfirmed
                            ? "Tu voto quedó registrado."
                            : "Voto ya confirmado."
                          : "Toca para seleccionar."}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Reflexión SOLO al seleccionar Nulo/Blanco (antes de confirmar) */}
            {!locked && showReflection && pendingSlug === "nulo-blanco" ? (
              <div className="mt-6 p-4 rounded-xl border-2 border-red-500 bg-green-50 text-sm text-slate-900 text-center">
                “Antes de optar por <b>nulo</b> o <b>en blanco</b>, asegúrate de haber investigado, comparado y
                reflexionado. Si nadie te convence, que sea una decisión consciente: tu voto vale y exige
                responsabilidad a quien pretende gobernar.”
              </div>
            ) : null}

            {/* Barra de confirmación (sobria) */}
            <div className="mt-6 flex flex-col gap-3 items-center">
              {!locked ? (
                <>
                  <div className="text-xs text-slate-700 text-center">
                    {pendingSlug ? (
                      <>
                        Selección actual: <b>{pendingSlug}</b>. Si ya estás seguro, presiona <b>Confirmar</b>.
                      </>
                    ) : (
                      <>Selecciona una opción para habilitar “Confirmar”.</>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={confirmVote}
                    disabled={!pendingSlug || !deviceId}
                    className={[
                      "inline-flex items-center gap-2 rounded-xl px-5 py-3 border-2 border-red-500 text-sm font-semibold shadow-sm transition",
                      pendingSlug
                        ? "bg-green-700 text-white hover:bg-green-800"
                        : "bg-slate-200 text-slate-600 cursor-not-allowed",
                    ].join(" ")}
                  >
                    ✅ Confirmar
                  </button>
                </>
              ) : (
                <div className="text-sm text-slate-900 text-center">✅ Tu intención de voto ya quedó registrada.</div>
              )}
            </div>
          </>
        )}
      </section>

      <footer className="mt-6 text-xs text-slate-700">
        VOTO CLARO • Intención de voto (confirmación) • “Infórmate, Reflexiona y Decide.”
      </footer>


      {/* Botón Subir (abajo al centro) */}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={scrollToTop}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 shadow-sm transition"
          aria-label="Subir al inicio"
          title="Subir"
        >
          ⬆ Subir
        </button>
      </div>
        </div>

    </main>
  );
}
