"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CommentRow = {
  id: string;
  created_at: string;
  group_code: string;
  message: string;
  status: "new" | "reviewed" | "archived" | "blocked";
};

type TimeFilter = "TODAY" | "D7" | "D30" | "ALL";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function getOrCreateDeviceId() {
  if (typeof window === "undefined") return null;
  const key = "vc_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = "DEV-" + crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0]/g, "o")
    .replace(/[1]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9\s]/g, " ");
}

function hasSoeces(text: string) {
  const t = normalizeText(text);
  const words = t.split(/\s+/).filter(Boolean);

  const banned = new Set([
    "porqueria",
    "basura",
    "asco",
    "mierda",
    "carajo",
    "puta",
    "puto",
    "culo",
    "verga",
    "cabron",
    "cabrona",
    "joder",
    "maldito",
    "maldita",
    "idiota",
    "imbecil",
    "pendejo",
    "pendeja",
    "cojudo",
    "cojuda",
  ]);

  return words.some((w) => banned.has(w));
}

function getSinceDate(filter: TimeFilter): Date | null {
  const now = new Date();
  if (filter === "ALL") return null;

  if (filter === "TODAY") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (filter === "D7") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  // D30
  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return d;
}

export default function ComentariosPage() {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [groupCode, setGroupCode] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const [sending, setSending] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [showPublic, setShowPublic] = useState(false);
  const [publicItems, setPublicItems] = useState<CommentRow[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  // ✅ Botón “Subir”
  const [showScrollTop, setShowScrollTop] = useState(false);

  // ✅ Verificación de datos (para permitir comentar)
  const [checkingData, setCheckingData] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // ✅ Formulario de datos (correo o celular)
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [savingData, setSavingData] = useState(false);

  // ✅ NUEVO: filtro por fecha para comentarios publicados
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("D7");

  useEffect(() => {
    const g = readCookie("vc_group");
    if (g) setGroupCode(g);
    setDeviceId(getOrCreateDeviceId());
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function checkIfHasData(currentDeviceId: string) {
    setCheckingData(true);
    setDataError(null);

    try {
      const { data, error } = await supabase
        .from("reto_premio_participants")
        .select("device_id")
        .eq("device_id", currentDeviceId)
        .limit(1);

      if (error) throw new Error(error.message);

      setHasData(!!(data && data.length > 0));
    } catch (e: any) {
      setHasData(false);
      setDataError(e?.message ?? String(e));
    } finally {
      setCheckingData(false);
    }
  }

  useEffect(() => {
    if (!deviceId) return;
    void checkIfHasData(deviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  async function saveMyData() {
    setOkMsg(null);
    setErrMsg(null);
    setDataError(null);

    if (!deviceId) {
      setErrMsg("No se pudo identificar tu dispositivo. Recarga la página.");
      return;
    }

    const em = email.trim();
    const ce = celular.trim();

    if (!em && !ce) {
      setErrMsg("Escribe al menos un correo o un celular.");
      return;
    }

    setSavingData(true);
    try {
      // Guardamos (o actualizamos) tus datos usando tu device_id
      const payload: any = {
  device_id: deviceId,
  group_code: groupCode, // ← agrega esto
};
      if (em) payload.email = em;
      if (ce) payload.celular = ce;
          const { error } = await supabase
  .from("reto_premio_participants")
  .update(payload)
  .eq("device_id", deviceId);
      if (error) throw new Error(error.message);

      setHasData(true);
      setOkMsg("Listo. Tus datos fueron guardados. Ya puedes comentar.");
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setSavingData(false);
    }
  }

  async function loadPublicReviewed() {
    setPublicLoading(true);
    setPublicError(null);

    try {
      let q = supabase
        .from("user_comments")
        .select("id,created_at,group_code,message,status")
        .eq("status", "reviewed")
        .order("created_at", { ascending: false })
        .limit(50);

      const since = getSinceDate(timeFilter);
      if (since) {
        q = q.gte("created_at", since.toISOString());
      }

      const { data, error } = await q;

      if (error) throw new Error(error.message);

      setPublicItems((data ?? []) as CommentRow[]);
    } catch (e: any) {
      setPublicError(e?.message ?? String(e));
    } finally {
      setPublicLoading(false);
    }
  }

  // ✅ Si la lista pública está abierta, se actualiza sola.
  // También se refresca cuando cambias el filtro de fecha.
  useEffect(() => {
    if (!showPublic) return;

    void loadPublicReviewed();

    const id = window.setInterval(() => {
      void loadPublicReviewed();
    }, 8000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPublic, timeFilter]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    // ✅ Primero: si no tiene datos, no puede comentar
    if (checkingData) {
      setErrMsg("Espera un momento… estamos verificando tus datos.");
      return;
    }
    if (!hasData) {
      setErrMsg("Para comentar, primero debes registrar tu correo o celular.");
      return;
    }

    const text = message.trim();
    if (!text) {
      setErrMsg("Escribe un comentario antes de enviar.");
      return;
    }

    // Filtro “amable” en pantalla (el filtro real ya está en la base de datos)
    if (hasSoeces(text)) {
      setErrMsg(
        "Aceptamos críticas negativas, pero sin insultos ni groserías. Por favor reescribe tu comentario con respeto."
      );
      return;
    }

    setSending(true);
    try {
      const payload: any = {
        message: text,
        status: "new",
        page: "/comentarios",
        group_code: groupCode?.trim() || "GENERAL",
      };

      if (deviceId) payload.device_id = deviceId;

      const { error } = await supabase.from("user_comments").insert(payload);
      if (error) throw new Error(error.message);

      setMessage("");
      setOkMsg("¡Gracias! Tu comentario fue enviado.");

      // ✅ Si el usuario tiene abierta la lista pública, refrescamos ya
      if (showPublic) {
        await loadPublicReviewed();
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  }

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-2xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const card = "mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-5 shadow-sm";
  const label = "text-xs font-extrabold text-slate-700";
  const input =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";
  const textarea =
    "mt-2 w-full min-h-[140px] rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  const select =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            Comentarios ciudadanos
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
            Para comentar, primero debes registrar tu correo o celular.
            <br />
            <span className="text-xs text-slate-600">
              Nadie verá tus datos. Solo se guardan para control y contacto si aplica.
            </span>
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link href="/" className={btn}>
            🏠 Inicio
          </Link>
          <button type="button" onClick={goBack} className={btn}>
            ← Volver
          </button>
        </div>
      </div>

      <section className={card}>
        {/* Mensajes */}
        {okMsg ? (
          <div className="rounded-xl border-2 border-green-700 bg-white p-3 text-sm font-bold text-green-800">
            {okMsg}
          </div>
        ) : null}

        {errMsg ? (
          <div className="mt-3 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
            Error: {errMsg}
          </div>
        ) : null}

        {dataError ? (
          <div className="mt-3 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
            Error al verificar datos: {dataError}
          </div>
        ) : null}

        {/* Si está verificando */}
        {checkingData ? (
          <div className="mt-3 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-slate-800">
            Verificando si ya registraste tus datos…
          </div>
        ) : null}

        {/* Si NO tiene datos: mostrar formulario para registrar */}
        {!checkingData && !hasData ? (
          <div className="mt-4 grid gap-4">
            <div className="rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-slate-800">
              Para poder comentar, registra por lo menos un correo o un celular.
              <div className="mt-1 text-xs text-slate-600">
                Si ya dejaste tus datos en Reto Ciudadano, toca “Ya dejé mis datos” para verificar.
              </div>
            </div>

            <div>
              <div className={label}>Correo (opcional si pones celular)</div>
              <input
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@dominio.com"
              />
            </div>

            <div>
              <div className={label}>Celular (opcional si pones correo)</div>
              <input
                className={input}
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                placeholder="999888777"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="button" className={btn} onClick={saveMyData} disabled={savingData}>
                {savingData ? "Guardando..." : "Guardar mis datos"}
              </button>

              <button
                type="button"
                className={btn}
                onClick={() => deviceId && checkIfHasData(deviceId)}
                disabled={savingData}
              >
                🔄 Ya dejé mis datos (verificar)
              </button>
            </div>
          </div>
        ) : null}

        {/* Si SÍ tiene datos: mostrar formulario normal de comentarios */}
        {!checkingData && hasData ? (
          <form onSubmit={onSubmit} className="grid gap-4 mt-4">
            <div>
              <div className={label}>Grupo (opcional)</div>
              <input
                className={input}
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                placeholder="Ej: GRUPOA"
              />
              <div className="mt-1 text-xs text-slate-600">
                Si vienes desde un pitch, esto se llena automáticamente.
              </div>
            </div>

            <div>
              <div className={label}>Tu comentario</div>
              <textarea
                className={textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe aquí…"
                maxLength={500}
              />
              <div className="mt-1 text-xs text-slate-600">Máximo 500 caracteres.</div>
            </div>

            <button type="submit" className={btn} disabled={sending}>
              {sending ? "Enviando..." : "Enviar comentario"}
            </button>

            {/* ✅ NUEVO: selector por fecha (arriba del botón de ver comentarios) */}
            <div className="mt-2 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
              <div className="text-sm font-extrabold text-slate-900">
                Ver comentarios publicados
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Filtra por fecha para que cargue rápido.
              </div>

              <div className="mt-3">
                <div className={label}>Mostrar</div>
                <select
                  className={select}
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                >
                  <option value="TODAY">Hoy</option>
                  <option value="D7">Últimos 7 días</option>
                  <option value="D30">Últimos 30 días</option>
                  <option value="ALL">Todos</option>
                </select>
              </div>

              <button
                type="button"
                className={btn + " w-full mt-3"}
                onClick={async () => {
                  const next = !showPublic;
                  setShowPublic(next);
                  if (next && publicItems.length === 0 && !publicLoading) {
                    await loadPublicReviewed();
                  }
                }}
              >
                {showPublic ? "▲ Ocultar comentarios publicados" : "▼ Ver comentarios publicados"}
              </button>

              {showPublic ? (
                <div className="mt-3 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
                  <div className="text-sm font-extrabold text-slate-900">
                    Comentarios publicados (aprobados)
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Se actualiza automáticamente cada pocos segundos.
                  </div>

                  {publicError ? (
                    <div className="mt-3 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
                      Error al cargar comentarios: {publicError}
                    </div>
                  ) : null}

                  {publicLoading ? (
                    <div className="mt-3 text-sm font-semibold text-slate-700">Cargando...</div>
                  ) : null}

                  {!publicLoading && !publicError && publicItems.length === 0 ? (
                    <div className="mt-3 text-sm font-semibold text-slate-700">
                      Aún no hay comentarios publicados.
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-3">
                    {publicItems.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                      >
                        <div className="text-xs font-extrabold text-slate-900">
                          {c.group_code} • {new Date(c.created_at).toLocaleString()}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                          {c.message}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        ) : null}
      </section>

      {/* ✅ Botón flotante “Subir” */}
      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 right-5 rounded-full border-2 border-red-600 bg-green-800 text-white font-extrabold px-4 py-3 shadow-sm hover:bg-green-900"
          aria-label="Subir"
          title="Subir"
        >
          ⬆ Subir
        </button>
      ) : null}
    </main>
  );
}