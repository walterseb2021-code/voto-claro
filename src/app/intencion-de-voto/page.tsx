// src/app/intencion-de-voto/page.tsx
"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

type VoteOption = {
  id: string;
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

/* =========================================================
   COMPONENTE REAL DE LA PÁGINA (usa useSearchParams)
   ========================================================= */

function IntencionDeVotoContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [deviceId, setDeviceId] = useState<string>("");

  const [active, setActive] = useState<ActiveResponse | null>(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const [activeErr, setActiveErr] = useState<string | null>(null);

  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [confirmedPartyId, setConfirmedPartyId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const [showReflection, setShowReflection] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function scrollToTop() {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  /* =========================================================
     1) Inicializar deviceId
     ========================================================= */

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  /* =========================================================
     2) GATE (crea cookie vc_group si no existe)
     ========================================================= */

  async function runGate() {
    if (!token) return;

    try {
      await fetch("/api/gate/pitch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
    } catch {
      // silencioso
    }
  }

  /* =========================================================
     3) Cargar ronda activa
     ========================================================= */

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

      data.options = (data.options ?? [])
        .filter((o) => o.enabled)
        .sort((a, b) => a.position - b.position);

      setActive(data);
    } catch {
      setActive(null);
      setActiveErr("Error de conexión cargando la ronda activa.");
    } finally {
      setLoadingActive(false);
    }
  }

  /* =========================================================
     INIT (gate + active)
     ========================================================= */

  useEffect(() => {
    async function init() {
      await runGate();
      await loadActive();
    }

    init();
  }, []);

  /* =========================================================
     4) Verificar si el dispositivo ya votó
     ========================================================= */

  useEffect(() => {
    async function checkStatus() {
      if (!deviceId) return;
      if (!active?.round?.id) return;

      try {
        const res = await fetch(
          `/api/vote/status?device_id=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );

        const data = await res.json();

        if (res.ok && data?.voted && data?.party_id) {
          setConfirmedPartyId(String(data.party_id));
          setLocked(true);
          setNotice("Tu intención de voto ya quedó registrada en esta encuesta.");
        }
      } catch {}
    }

    checkStatus();
  }, [deviceId, active?.round?.id]);

  /* =========================================================
     DERIVADOS
     ========================================================= */

  const total = useMemo(() => {
    const opts = active?.options ?? [];
    return opts.reduce((acc, o) => acc + (o.total_votes ?? 0), 0);
  }, [active?.options]);

  const quote = useMemo(() => {
    const idx = Math.abs(total) % MOTIVATIONAL.length;
    return MOTIVATIONAL[idx];
  }, [total]);

  /* =========================================================
     SELECCIÓN
     ========================================================= */

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

  /* =========================================================
     CONFIRMAR VOTO
     ========================================================= */

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
        setNotice(data?.error ?? "No se pudo registrar el voto.");

        if (res.status === 409) {
          setLocked(true);
        }

        return;
      }

      setLocked(true);
      setConfirmedPartyId(String(data?.party?.id ?? ""));
      setNotice("Listo. Tu intención de voto quedó registrada.");

      if (pendingSlug === "nulo-blanco") setShowReflection(true);

      await loadActive();
    } catch {
      setNotice("Error de conexión. Intenta nuevamente.");
    }
  }

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

            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
              Intención de voto
            </h1>

            <p className="mt-2 text-sm md:text-base text-slate-800">
              Selecciona tu opción y luego presiona <b>Confirmar</b>.
            </p>

            <div className="mt-3 flex gap-2 flex-wrap">
              <Pill>Editable hasta confirmar</Pill>
              <Pill>1 voto por dispositivo</Pill>
            </div>

            <div className="mt-4 text-sm text-slate-900">
              <span className="inline-block rounded-lg bg-green-100 px-3 py-2 border-2 border-red-500">
                “{quote}”
              </span>
            </div>

            <div className="mt-4 text-xs text-slate-700">
              Total registrado: <b>{total}</b>
            </div>

            {notice && (
              <div className="mt-4 text-sm text-slate-900">
                <div className="inline-block rounded-xl bg-green-50 border-2 border-red-500 px-4 py-2">
                  {notice}
                </div>
              </div>
            )}

          </div>
        </section>

      </div>
    </main>
  );
}

/* =========================================================
   EXPORT PRINCIPAL CON SUSPENSE
   ========================================================= */

export default function IntencionDeVotoPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Cargando...</div>}>
      <IntencionDeVotoContent />
    </Suspense>
  );
}
