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

  const [showScrollTop, setShowScrollTop] = useState(false);

  const [checkingData, setCheckingData] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [savingData, setSavingData] = useState(false);

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
      const payload: any = {
        device_id: deviceId,
        group_code: groupCode,
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
     setOkMsg(
  "¡Gracias! Tu comentario fue enviado y está en revisión. Aparecerá en 'Comentarios aprobados' si cumple las normas de respeto."
);

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
    "min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
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
  const placeholderCard =
    "mt-4 rounded-2xl border-2 border-dashed border-red-500 bg-white/80 p-5 shadow-sm";

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            Comentarios ciudadanos
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
            Participa en el tema de la semana, comenta con acceso verificado y sigue
            el debate público.
            <br />
            <span className="text-xs text-slate-600">
              La participación está sujeta a control de respeto y moderación.
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

      {/* BLOQUE 1: Acceso verificado */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Acceso verificado
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Para comentar en esta sección, primero debes registrar por lo menos un
          correo o un celular. Tus datos no se muestran públicamente.
        </p>

        {okMsg ? (
          <div className="mt-4 rounded-xl border-2 border-green-700 bg-white p-3 text-sm font-bold text-green-800">
            {okMsg}
          </div>
        ) : null}

        {errMsg ? (
          <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
            Error: {errMsg}
          </div>
        ) : null}

        {dataError ? (
          <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
            Error al verificar datos: {dataError}
          </div>
        ) : null}

        {checkingData ? (
          <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-slate-800">
            Verificando si ya registraste tus datos…
          </div>
        ) : null}

        {!checkingData && !hasData ? (
          <div className="mt-4 grid gap-4">
            <div className="rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-slate-800">
              Para poder comentar, registra por lo menos un correo o un celular.
              <div className="mt-1 text-xs text-slate-600">
                Si ya dejaste tus datos en otra sección, toca “Ya dejé mis datos” para verificar.
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

        {!checkingData && hasData ? (
          <div className="mt-4 rounded-2xl border-2 border-green-700 bg-green-50 p-4">
            <div className="text-sm font-extrabold text-green-800">Acceso habilitado</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 leading-relaxed">
              Ya puedes comentar en el tema activo y participar en las próximas
              dinámicas de esta sección.
            </div>
          </div>
        ) : null}
      </section>

      {/* BLOQUE 2: Tema de la semana */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Tema de la semana
        </h2>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50/70 p-4">
          <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            Tema
          </div>
          <div className="mt-1 text-xl md:text-2xl font-extrabold text-slate-900">
            Corrupción
          </div>

          <div className="mt-4 text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            Pregunta guía
          </div>
          <div className="mt-1 text-sm md:text-base font-semibold text-slate-800 leading-relaxed">
            ¿Qué medida concreta debería aplicarse primero para castigar la
            corrupción política en el Perú?
          </div>

          <div className="mt-4 text-xs text-slate-600 font-semibold">
            Estado actual: abierto para comentarios ciudadanos.
          </div>
        </div>
      </section>

      {/* BLOQUE 3: Comentario del tema */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Tu comentario sobre el tema de la semana
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Puedes opinar, criticar o proponer, pero siempre con respeto.
        </p>

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
              <div className={label}>Comentario</div>
              <textarea
                className={textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe aquí tu opinión sobre el tema de la semana..."
                maxLength={500}
              />
              <div className="mt-1 text-xs text-slate-600">Máximo 500 caracteres.</div>
            </div>

            <button type="submit" className={btn} disabled={sending}>
              {sending ? "Enviando..." : "Enviar comentario"}
            </button>
          </form>
        ) : (
          !checkingData && (
            <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-4 text-sm font-semibold text-slate-700">
              Primero activa tu acceso verificado para poder comentar en este tema.
            </div>
          )
        )}
      </section>

      {/* BLOQUE 4: Debate público publicado */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Comentarios aprobados
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
           Los comentarios enviados no aparecen de inmediato. Primero pasan por revisión
           y luego se publican si son aprobados.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
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
            <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
              <div className="text-sm font-extrabold text-slate-900">
                Comentarios aprobados
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
      </section>

      {/* BLOQUE 5: Yo Político */}
      <section className={placeholderCard}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          YO POLÍTICO
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Próximamente podrás participar subiendo el enlace de un video corto en
          TikTok, YouTube o Facebook sobre el tema de la semana.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50/60 p-4">
          <div className="text-sm font-extrabold text-slate-900">Participación en video</div>
          <ul className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed pl-5 list-disc">
            <li>Un video por usuario por semana.</li>
            <li>Duración breve y mensaje preciso.</li>
            <li>Sujeto a revisión y moderación.</li>
            <li>Luego pasará a votación ciudadana.</li>
          </ul>

          <button
            type="button"
            disabled
            className={
              "mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
              "border-2 border-red-600 bg-slate-300 text-slate-700 text-sm font-extrabold cursor-not-allowed"
            }
          >
            Próximamente
          </button>
        </div>
      </section>

      {/* BLOQUE 6: Votación ciudadana */}
      <section className={placeholderCard}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Votación ciudadana
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Cuando cierre la etapa de videos, aquí aparecerán las participaciones
          aprobadas para votación del público validado.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4">
          <div className="text-sm font-extrabold text-slate-900">Estado actual</div>
          <div className="mt-2 text-sm font-semibold text-slate-700">
            Aún no disponible.
          </div>
          <div className="mt-2 text-xs text-slate-600 leading-relaxed">
            La votación semanal estará habilitada cuando exista la fase de videos
            ciudadanos y control de participación activa.
          </div>
        </div>
      </section>

      {/* BLOQUE 7: Debates anteriores */}
      <section className={placeholderCard}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Debates anteriores
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Aquí se archivarán los temas semanales, sus comentarios aprobados,
          participaciones destacadas y resultados.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4">
          <div className="text-sm font-extrabold text-slate-900">Archivo histórico</div>
          <div className="mt-2 text-sm font-semibold text-slate-700">
            Próximamente se mostrará el historial de temas de debate ciudadano.
          </div>
        </div>
      </section>

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