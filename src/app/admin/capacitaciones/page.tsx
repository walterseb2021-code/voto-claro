// src/app/admin/capacitaciones/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type TrainingStatus = "active" | "pending" | "inactive" | "rejected";

type ProfessionalInfo = {
  id: string;
  codigo_profesional: string | null;
  public_name: string | null;
  professional_type: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
};

type TrainingItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  resource_type: string;
  resource_url: string;
  status: TrainingStatus;
  is_free: boolean;
  created_at: string;
  updated_at: string;
  admin_note: string | null;
  reviewed_at: string | null;
  rejected_reason: string | null;
  updated_by_admin: boolean;
  professional: ProfessionalInfo | null;
};

const STATUS_OPTIONS: { value: TrainingStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "pending", label: "En revisión" },
  { value: "inactive", label: "Inactivos" },
  { value: "rejected", label: "Rechazados" },
];

const STATUS_LABEL: Record<TrainingStatus, string> = {
  active: "Activo",
  pending: "En revisión",
  inactive: "Inactivo",
  rejected: "Rechazado",
};

const STATUS_CLASS: Record<TrainingStatus, string> = {
  active: "bg-green-100 text-green-800 border-green-300",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  inactive: "bg-slate-100 text-slate-700 border-slate-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";

  return new Date(dateStr).toLocaleString("es-PE", {
    timeZone: "America/Lima",
  });
}

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function AdminCapacitacionesPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TrainingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [rejectedReasons, setRejectedReasons] = useState<Record<string, string>>({});

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-6xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const btnSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/admin");
  }

  async function loadTrainings(nextStatus = statusFilter) {
    setLoading(true);
    setMessage(null);

    try {
      const params = new URLSearchParams();

      if (nextStatus !== "all") {
        params.set("status", nextStatus);
      }

      const res = await fetch(
        `/api/admin/capacitaciones/list${params.toString() ? `?${params.toString()}` : ""}`,
        {
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudieron cargar las capacitaciones.");
      }

      const list = data?.capacitaciones || [];
      setItems(list);

      const notes: Record<string, string> = {};
      const reasons: Record<string, string> = {};

      for (const item of list) {
        notes[item.id] = item.admin_note || "";
        reasons[item.id] = item.rejected_reason || "";
      }

      setAdminNotes(notes);
      setRejectedReasons(reasons);
    } catch (err: any) {
      console.error("Error cargando capacitaciones:", err);
      setMessage({
        type: "error",
        text: err?.message || "No se pudieron cargar las capacitaciones.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (!alive) return;

        if (!data?.session) {
          router.replace("/admin/login?next=/admin/capacitaciones");
          return;
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase.auth]);

  useEffect(() => {
    if (!checking) {
      loadTrainings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return items;

    return items.filter((item) => {
      const professionalName = item.professional?.public_name || "";
      const professionalCode = item.professional?.codigo_profesional || "";
      const text = [
        item.title,
        item.description || "",
        item.category,
        item.resource_type,
        item.resource_url,
        item.status,
        item.admin_note || "",
        item.rejected_reason || "",
        professionalName,
        professionalCode,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [items, search]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] += 1;
        return acc;
      },
      {
        total: 0,
        active: 0,
        pending: 0,
        inactive: 0,
        rejected: 0,
      } as Record<"total" | TrainingStatus, number>
    );
  }, [items]);

  async function updateTrainingStatus(item: TrainingItem, status: TrainingStatus) {
    const rejectedReason = rejectedReasons[item.id] || "";
    const adminNote = adminNotes[item.id] || "";

    if (status === "rejected" && rejectedReason.trim().length < 5) {
      setMessage({
        type: "error",
        text: "Para rechazar una capacitación debes escribir un motivo de rechazo.",
      });
      return;
    }

    if (
      (status === "inactive" || status === "rejected") &&
      !confirm(`¿Confirmas cambiar esta capacitación a estado "${STATUS_LABEL[status]}"?`)
    ) {
      return;
    }

    setUpdatingId(item.id);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/capacitaciones/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          status,
          admin_note: adminNote,
          rejected_reason: status === "rejected" ? rejectedReason : "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo actualizar la capacitación.");
      }

      setMessage({
        type: "success",
        text: data?.message || "Capacitación actualizada correctamente.",
      });

      await loadTrainings();
    } catch (err: any) {
      console.error("Error actualizando capacitación:", err);
      setMessage({
        type: "error",
        text: err?.message || "No se pudo actualizar la capacitación.",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveAdminNote(item: TrainingItem) {
    setUpdatingId(item.id);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/capacitaciones/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          status: item.status,
          admin_note: adminNotes[item.id] || "",
          rejected_reason: rejectedReasons[item.id] || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo guardar la nota administrativa.");
      }

      setMessage({
        type: "success",
        text: data?.message || "Nota administrativa guardada.",
      });

      await loadTrainings();
    } catch (err: any) {
      console.error("Error guardando nota:", err);
      setMessage({
        type: "error",
        text: err?.message || "No se pudo guardar la nota administrativa.",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  if (checking) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin Capacitaciones – VOTO CLARO
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Verificando sesión.
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          📚 Admin Capacitaciones
        </h1>

        <div className="flex gap-2 flex-wrap">
          <Link href="/admin" className={btnSm}>
            🧭 Admin Central
          </Link>

          <button type="button" onClick={goBack} className={btnSm}>
            ← Volver
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded-lg border text-sm font-semibold ${
            message.type === "success"
              ? "bg-green-100 border-green-400 text-green-800"
              : "bg-red-100 border-red-400 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                Moderación de cursos, talleres, videos y materiales
              </div>

              <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
                Desde aquí puedes revisar publicaciones educativas realizadas por profesionales,
                cambiar su estado, anotar observaciones y abrir el recurso externo.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadTrainings()}
                disabled={loading}
                className={btnSm}
              >
                {loading ? "Cargando..." : "↻ Refrescar"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-bold">
            <div className="rounded-xl border border-slate-300 bg-white p-3">
              Total: {counts.total}
            </div>
            <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-green-800">
              Activos: {counts.active}
            </div>
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-yellow-800">
              Revisión: {counts.pending}
            </div>
            <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-700">
              Inactivos: {counts.inactive}
            </div>
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800">
              Rechazados: {counts.rejected}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Estado
              </label>

              <select
                value={statusFilter}
                onChange={(e) => {
                  const next = e.target.value as TrainingStatus | "all";
                  setStatusFilter(next);
                  loadTrainings(next);
                }}
                className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Buscar
              </label>

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm"
                placeholder="Buscar por título, categoría, profesional, código, enlace o nota..."
              />
            </div>
          </div>
        </div>
      </section>

      <section className={sectionWrap + " mt-6"}>
        <div className={inner}>
          <div className="text-sm font-extrabold text-slate-900">
            Publicaciones encontradas: {filteredItems.length}
          </div>

          {loading ? (
            <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Cargando capacitaciones...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No hay capacitaciones para los filtros seleccionados.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-extrabold ${
                            STATUS_CLASS[item.status]
                          }`}
                        >
                          {STATUS_LABEL[item.status]}
                        </span>

                        <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
                          {item.category}
                        </span>

                        <span className="rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-800">
                          {item.resource_type}
                        </span>
                      </div>

                      <h2 className="mt-3 text-lg font-extrabold text-slate-900">
                        {item.title}
                      </h2>

                      {item.description && (
                        <p className="mt-2 text-sm text-slate-700">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-3 text-xs text-slate-600 space-y-1">
                        <p>
                          <strong>Profesional:</strong>{" "}
                          {item.professional?.public_name || "No identificado"}
                        </p>

                        <p>
                          <strong>Código:</strong>{" "}
                          {item.professional?.codigo_profesional || "-"}
                        </p>

                        <p>
                          <strong>Tipo profesional:</strong>{" "}
                          {item.professional?.professional_type || "-"}
                        </p>

                        <p>
                          <strong>Enlace:</strong> {shortUrl(item.resource_url)}
                        </p>

                        <p>
                          <strong>Creado:</strong> {formatDate(item.created_at)} ·{" "}
                          <strong>Actualizado:</strong> {formatDate(item.updated_at)}
                        </p>

                        <p>
                          <strong>Revisado:</strong> {formatDate(item.reviewed_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 min-w-full lg:min-w-[220px]">
                      <a
                        href={item.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={btnSm + " text-center"}
                      >
                        Abrir recurso →
                      </a>

                      <button
                        type="button"
                        onClick={() => updateTrainingStatus(item, "active")}
                        disabled={updatingId === item.id}
                        className="rounded-xl border-2 border-green-600 bg-green-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-green-800 disabled:opacity-60"
                      >
                        Aprobar / Activar
                      </button>

                      <button
                        type="button"
                        onClick={() => updateTrainingStatus(item, "pending")}
                        disabled={updatingId === item.id}
                        className="rounded-xl border-2 border-yellow-500 bg-yellow-500 px-3 py-2 text-xs font-extrabold text-white hover:bg-yellow-600 disabled:opacity-60"
                      >
                        En revisión
                      </button>

                      <button
                        type="button"
                        onClick={() => updateTrainingStatus(item, "inactive")}
                        disabled={updatingId === item.id}
                        className="rounded-xl border-2 border-slate-500 bg-slate-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        Desactivar
                      </button>

                      <button
                        type="button"
                        onClick={() => updateTrainingStatus(item, "rejected")}
                        disabled={updatingId === item.id}
                        className="rounded-xl border-2 border-red-600 bg-red-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-red-800 disabled:opacity-60"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nota administrativa
                      </label>

                      <textarea
                        value={adminNotes[item.id] || ""}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        rows={3}
                        className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm"
                        placeholder="Nota interna del administrador..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Motivo de rechazo
                      </label>

                      <textarea
                        value={rejectedReasons[item.id] || ""}
                        onChange={(e) =>
                          setRejectedReasons((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        rows={3}
                        className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm"
                        placeholder="Obligatorio si se rechaza la publicación..."
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => saveAdminNote(item)}
                    disabled={updatingId === item.id}
                    className="mt-3 rounded-xl border-2 border-blue-600 bg-blue-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    Guardar nota administrativa
                  </button>

                  {item.rejected_reason && (
                    <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800">
                      <strong>Motivo de rechazo actual:</strong> {item.rejected_reason}
                    </div>
                  )}

                  {item.admin_note && (
                    <div className="mt-3 rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs text-blue-800">
                      <strong>Nota administrativa actual:</strong> {item.admin_note}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
        <strong>⚠️ Aviso de administración:</strong> Antes de aprobar o mantener
        activa una publicación, revisa que el enlace abra correctamente, que el
        contenido sea coherente con capacitación emprendedora y que no parezca
        engañoso, ofensivo, inseguro o ajeno a los fines de la plataforma.
      </section>
    </main>
  );
}
