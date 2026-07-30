// src/app/admin/vote-rounds/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type IdentityMode = "legacy_device" | "secure_session";
type LifecycleState = "legacy" | "draft" | "active" | "closed";

type Round = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  group_code: string;
  identity_mode: IdentityMode;
  ends_at: string | null;
  lifecycle_state: LifecycleState;
  activated_at: string | null;
  closed_at: string | null;
};

type RoundsPayload = {
  rounds: Round[];
  secure_session_available: boolean;
};

type Operation =
  | "load"
  | "create"
  | `activate:${string}`
  | `close:${string}`;

const GROUP_OPTIONS = ["GRUPOA", "GRUPOB", "GRUPOC", "GRUPOD", "GRUPOE"] as const;
type GroupCode = (typeof GROUP_OPTIONS)[number];

const GROUP_RE = /^GRUPO[A-Z]$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERU_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const peruDateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const peruPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full border border-green-200 bg-green-100 text-green-800 font-medium">
      {children}
    </span>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isIdentityMode(value: unknown): value is IdentityMode {
  return value === "legacy_device" || value === "secure_session";
}

function isLifecycleState(value: unknown): value is LifecycleState {
  return (
    value === "legacy" ||
    value === "draft" ||
    value === "active" ||
    value === "closed"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isGroupCodeOption(value: unknown): value is GroupCode {
  return GROUP_OPTIONS.some((group) => group === value);
}

function isRound(value: unknown): value is Round {
  if (!isPlainObject(value)) return false;

  return (
    typeof value.id === "string" &&
    UUID_RE.test(value.id) &&
    typeof value.name === "string" &&
    typeof value.is_active === "boolean" &&
    typeof value.created_at === "string" &&
    typeof value.group_code === "string" &&
    GROUP_RE.test(value.group_code) &&
    isIdentityMode(value.identity_mode) &&
    isNullableString(value.ends_at) &&
    isLifecycleState(value.lifecycle_state) &&
    isNullableString(value.activated_at) &&
    isNullableString(value.closed_at)
  );
}

function parseRoundsPayload(value: unknown, expectedGroup: string): RoundsPayload | null {
  if (!isPlainObject(value)) return null;
  if (!Array.isArray(value.rounds)) return null;
  if (typeof value.secure_session_available !== "boolean") return null;
  if (!value.rounds.every(isRound)) return null;
  if (!value.rounds.every((round) => round.group_code === expectedGroup)) return null;

  return {
    rounds: value.rounds,
    secure_session_available: value.secure_session_available,
  };
}

function parseErrorCode(value: unknown) {
  if (!isPlainObject(value) || typeof value.error !== "string") {
    return null;
  }

  return value.error;
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function modeLabel(mode: IdentityMode) {
  if (mode === "legacy_device") return "Compatibilidad anterior";
  return "Sesión segura por ronda";
}

function statusLabel(round: Round) {
  if (round.lifecycle_state === "legacy") {
    return round.is_active ? "Activa heredada" : "Histórica heredada";
  }

  if (round.lifecycle_state === "draft") return "Borrador";
  if (round.lifecycle_state === "active") return "Activa";
  return "Cerrada";
}

function formatPeruDate(value: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Sin fecha";

  return peruDateTimeFormatter.format(date);
}

function partMap(date: Date) {
  const parts = peruPartsFormatter.formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localPeruDateTimeToIso(value: string) {
  const match = value.match(PERU_LOCAL_RE);
  if (!match) return null;

  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (
    !Number.isSafeInteger(year) ||
    !Number.isSafeInteger(month) ||
    !Number.isSafeInteger(day) ||
    !Number.isSafeInteger(hour) ||
    !Number.isSafeInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const timestamp = `${rawYear}-${rawMonth}-${rawDay}T${rawHour}:${rawMinute}:00-05:00`;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    return null;
  }

  const parts = partMap(date);
  if (
    parts.year !== rawYear ||
    parts.month !== rawMonth ||
    parts.day !== rawDay ||
    parts.hour !== rawHour ||
    parts.minute !== rawMinute
  ) {
    return null;
  }

  return date.toISOString();
}

function publicErrorMessage(status: number, code: string | null) {
  if (status === 401) return "Sesión admin vencida.";
  if (code === "configuration_unavailable") {
    return "Configuración segura no disponible.";
  }
  if (code === "round_not_found") return "Ronda no encontrada.";
  if (code === "round_not_draft") return "La ronda ya no es borrador.";
  if (code === "round_not_active") return "La ronda ya no está activa.";
  if (code === "temporary_error") return "Error temporal.";
  if (status === 400 || status === 403) return "Solicitud inválida.";

  return "Error temporal.";
}

export default function AdminVoteRoundsPage() {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  const [checking, setChecking] = useState(true);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    // Esta ruta debe estar protegida server-side por proxy.ts (cookies + ADMIN_EMAIL).
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        if (!data?.session) {
          router.replace("/admin/login");
          return;
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rounds, setRounds] = useState<Round[]>([]);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupCode>("GRUPOB");
  const [secureSessionAvailable, setSecureSessionAvailable] = useState(false);

  const [newName, setNewName] = useState("");
  const [newIdentityMode, setNewIdentityMode] =
    useState<IdentityMode>("legacy_device");
  const [newEndsAtLocal, setNewEndsAtLocal] = useState("");
  const loadRequestIdRef = useRef(0);

  const busy = operation !== null;

  function handleGroupChange(groupCode: GroupCode) {
    loadRequestIdRef.current += 1;
    setOperation("load");
    setRounds([]);
    setSecureSessionAvailable(false);
    setNotice(null);
    setSelectedGroup(groupCode);
  }

  async function handleError(response: Response, payload: unknown) {
    const message = publicErrorMessage(response.status, parseErrorCode(payload));
    setNotice(message);

    if (response.status === 401) {
      router.replace("/admin/login");
    }
  }

  async function loadRounds(force = false, clearNotice = true) {
    if (!force && operation && operation !== "load") return false;

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const requestGroup = selectedGroup;
    const isCurrentRequest = () => loadRequestIdRef.current === requestId;

    setOperation("load");
    if (clearNotice) setNotice(null);
    try {
      const res = await fetch(
        `/api/vote/admin/rounds?group_code=${encodeURIComponent(requestGroup)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await readJson(res);
      if (!res.ok) {
        if (!isCurrentRequest()) return false;
        await handleError(res, data);
        setRounds([]);
        setSecureSessionAvailable(false);
        return false;
      }

      const payload = parseRoundsPayload(data, requestGroup);
      if (!payload) {
        if (!isCurrentRequest()) return false;
        setNotice("Solicitud inválida.");
        setRounds([]);
        setSecureSessionAvailable(false);
        return false;
      }

      if (!isCurrentRequest()) return false;
      setRounds(payload.rounds);
      setSecureSessionAvailable(payload.secure_session_available);
      return true;
    } catch {
      if (!isCurrentRequest()) return false;
      setNotice("Error temporal.");
      setRounds([]);
      setSecureSessionAvailable(false);
      return false;
    } finally {
      if (isCurrentRequest()) setOperation(null);
    }
  }

  useEffect(() => {
    if (checking) return;
    void loadRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, selectedGroup]);

  const visibleRounds = useMemo(
    () => rounds.filter((round) => round.group_code === selectedGroup),
    [rounds, selectedGroup]
  );

  const activeRound = useMemo(
    () =>
      visibleRounds.find(
        (round) => round.group_code === selectedGroup && round.is_active
      ) ?? null,
    [selectedGroup, visibleRounds]
  );

  async function createRound() {
    if (busy) return;

    const name = newName.trim();
    if (!name || name.length > 160) {
      setNotice("Solicitud inválida.");
      return;
    }

    let endsAt: string | null = null;
    if (newIdentityMode === "secure_session") {
      endsAt = localPeruDateTimeToIso(newEndsAtLocal);
      if (!endsAt) {
        setNotice("Solicitud inválida.");
        return;
      }
    }

    setOperation("create");
    setNotice("Creando borrador…");
    try {
      const res = await fetch("/api/vote/admin/rounds", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          group_code: selectedGroup,
          identity_mode: newIdentityMode,
          ends_at: endsAt,
        }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        await handleError(res, data);
        return;
      }

      setNewName("");
      setNewEndsAtLocal("");
      setNewIdentityMode("legacy_device");
      const loaded = await loadRounds(true, false);
      if (loaded) setNotice("Borrador creado.");
    } catch {
      setNotice("Error temporal.");
    } finally {
      setOperation(null);
    }
  }

  async function activateRound(round: Round) {
    if (busy || round.lifecycle_state !== "draft") return;
    if (round.group_code !== selectedGroup) return;
    if (round.identity_mode === "secure_session" && !secureSessionAvailable) return;

    const secureLine =
      round.identity_mode === "secure_session"
        ? `\nFecha de cierre: ${formatPeruDate(round.ends_at)}`
        : "";
    const ok = window.confirm(
      `¿Activar este borrador?\n\nNombre: ${round.name}\nGrupo: ${round.group_code}\nModo: ${modeLabel(round.identity_mode)}${secureLine}\n\nEsto reemplazará la ronda activa del grupo.`
    );
    if (!ok) return;

    setOperation(`activate:${round.id}`);
    setNotice("Activando ronda…");
    try {
      const res = await fetch("/api/vote/admin/rounds", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id: round.id }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        await handleError(res, data);
        return;
      }

      const loaded = await loadRounds(true, false);
      if (loaded) setNotice("Ronda activada.");
    } catch {
      setNotice("Error temporal.");
    } finally {
      setOperation(null);
    }
  }

  async function closeRound(round: Round) {
    if (busy) return;
    if (round.group_code !== selectedGroup) return;

    const canClose =
      round.group_code === selectedGroup &&
      (round.lifecycle_state === "active" ||
        (round.lifecycle_state === "legacy" && round.is_active));
    if (!canClose) return;

    const ok = window.confirm(
      "¿Cerrar esta ronda?\n\nSe detendrá la participación.\nSe revocarán sesiones abiertas.\nNo se activará otra ronda automáticamente."
    );
    if (!ok) return;

    setOperation(`close:${round.id}`);
    setNotice("Cerrando ronda…");
    try {
      const res = await fetch("/api/vote/admin/rounds", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id: round.id }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        await handleError(res, data);
        return;
      }

      const loaded = await loadRounds(true, false);
      if (loaded) setNotice("Ronda cerrada.");
    } catch {
      setNotice("Error temporal.");
    } finally {
      setOperation(null);
    }
  }

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
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
  const btnDangerSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-red-700 text-white text-xs font-extrabold " +
    "hover:bg-red-800 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const input =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-3 " +
    "text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600";
  const select =
    "rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-extrabold " +
    "text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600";

  if (checking) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – Rondas de Voto
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Verificando sesión.
            </div>
          </div>
        </section>

        <button type="button" onClick={goBack} className={btn + " mt-4"}>
          ← Volver
        </button>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – Rondas de Voto
        </h1>
        <div className="text-xs font-extrabold text-slate-700">
          Grupo seleccionado: {selectedGroup}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/live" className={btnSm}>
            🔴 Admin EN VIVO
          </Link>
          <button type="button" onClick={goBack} className={btnSm}>
            ← Volver
          </button>
        </div>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Ronda activa</div>
              <div className="mt-1 text-sm text-slate-800">
                {activeRound ? (
                  <>
                    <Pill>{statusLabel(activeRound)}</Pill>{" "}
                    <span className="ml-2 font-extrabold text-slate-900">
                      {activeRound.name}
                    </span>
                  </>
                ) : (
                  <span className="text-red-700 font-extrabold">No hay ronda activa</span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-600">
                El público nunca ve rondas. La encuesta usa internamente la ronda activa de {selectedGroup}.
              </div>
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <label className="text-xs font-extrabold text-slate-700">
                Grupo
                <select
                  value={selectedGroup}
                  onChange={(event) => {
                    if (isGroupCodeOption(event.target.value)) {
                      handleGroupChange(event.target.value);
                    }
                  }}
                  className={select + " block mt-1"}
                  disabled={busy}
                >
                  {GROUP_OPTIONS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => void loadRounds()}
                className={btnSm}
                disabled={busy}
              >
                {operation === "load" ? "Cargando…" : "↻ Refrescar"}
              </button>
            </div>
          </div>

          {notice ? (
            <div className="mt-4 text-sm text-slate-900">
              <div className="inline-block rounded-xl bg-green-50 border-2 border-red-500 px-4 py-2">
                {notice}
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
            <div className="text-sm font-extrabold text-slate-900">
              Crear borrador
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Crea una ronda inactiva para {selectedGroup}. La activación se hace después.
            </div>

            <label className="mt-3 block text-xs font-extrabold text-slate-700">
              Nombre
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder='Ej: "Intención de voto - Semana 2"'
                className={input}
                maxLength={160}
                disabled={busy}
              />
            </label>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-extrabold text-slate-700">
                Grupo
                <select
                  value={selectedGroup}
                  onChange={(event) => {
                    if (isGroupCodeOption(event.target.value)) {
                      handleGroupChange(event.target.value);
                    }
                  }}
                  className={select + " block mt-2 w-full"}
                  disabled={busy}
                >
                  {GROUP_OPTIONS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-extrabold text-slate-700">
                Modo
                <select
                  value={newIdentityMode}
                  onChange={(event) =>
                    setNewIdentityMode(event.target.value as IdentityMode)
                  }
                  className={select + " block mt-2 w-full"}
                  disabled={busy}
                >
                  <option value="legacy_device">Compatibilidad anterior</option>
                  <option value="secure_session">Sesión segura por ronda</option>
                </select>
              </label>
            </div>

            {newIdentityMode === "secure_session" ? (
              <label className="mt-3 block text-xs font-extrabold text-slate-700">
                Fecha y hora de cierre
                <input
                  type="datetime-local"
                  value={newEndsAtLocal}
                  onChange={(event) => setNewEndsAtLocal(event.target.value)}
                  className={input}
                  disabled={busy}
                />
                <span className="mt-1 block text-xs font-semibold text-slate-600">
                  Hora de Perú (UTC-5)
                </span>
              </label>
            ) : null}

            {newIdentityMode === "secure_session" && !secureSessionAvailable ? (
              <div className="mt-3 text-xs font-semibold text-red-700">
                La configuración de sesión segura aún no está disponible. El borrador no podrá activarse.
              </div>
            ) : null}

            <button
              type="button"
              onClick={createRound}
              className={btn + " mt-3"}
              disabled={busy}
            >
              {operation === "create" ? "Creando…" : "➕ Crear borrador"}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
            <div className="text-sm font-extrabold text-slate-900">Historial de rondas (admin)</div>

            {operation === "load" && visibleRounds.length === 0 ? (
              <div className="mt-3 text-sm text-slate-700">Cargando…</div>
            ) : visibleRounds.length === 0 ? (
              <div className="mt-3 text-sm text-slate-700">No hay rondas registradas.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {visibleRounds.map((round) => {
                  const activateBlockedByConfig =
                    round.lifecycle_state === "draft" &&
                    round.group_code === selectedGroup &&
                    round.identity_mode === "secure_session" &&
                    !secureSessionAvailable;
                  const canActivate =
                    round.group_code === selectedGroup &&
                    round.lifecycle_state === "draft" &&
                    !activateBlockedByConfig;
                  const canClose =
                    round.group_code === selectedGroup &&
                    (round.lifecycle_state === "active" ||
                      (round.lifecycle_state === "legacy" && round.is_active));
                  const activating = operation === `activate:${round.id}`;
                  const closing = operation === `close:${round.id}`;

                  return (
                    <div
                      key={round.id}
                      className="rounded-2xl border-2 border-red-600 bg-green-50/50 p-3 flex items-start justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 break-words">
                          {round.name}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          Creación: {formatPeruDate(round.created_at)} · ID: {round.id}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          Grupo: {round.group_code} · Modo: {modeLabel(round.identity_mode)}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          Fecha de cierre: {formatPeruDate(round.ends_at)}
                        </div>
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <Pill>{statusLabel(round)}</Pill>
                          <Pill>{round.group_code}</Pill>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {round.lifecycle_state === "draft" ? (
                          <button
                            type="button"
                            className={btnSm}
                            disabled={busy || !canActivate}
                            onClick={() => activateRound(round)}
                            title={
                              activateBlockedByConfig
                                ? "Configuración segura no disponible"
                                : "Activa este borrador"
                            }
                          >
                            {activating ? "Activando…" : "✅ Activar"}
                          </button>
                        ) : null}

                        {canClose ? (
                          <button
                            type="button"
                            className={btnDangerSm}
                            disabled={busy}
                            onClick={() => closeRound(round)}
                            title="Cierra esta ronda"
                          >
                            {closing ? "Cerrando…" : "⛔ Cerrar"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 text-xs text-slate-700">
            Importante: cerrar una ronda no activa otra automáticamente.
          </div>
        </div>
      </section>
    </main>
  );
}
