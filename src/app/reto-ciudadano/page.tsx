"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

function getOrCreateDeviceId() {
  if (typeof window === "undefined") return null;
  const key = "vc_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = "DEV-" + crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

export default function RetoCiudadanoPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();
    const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [checkingData, setCheckingData] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<any>(null);

  const [codigoAcceso, setCodigoAcceso] = useState("");
  const [loginCodigoLoading, setLoginCodigoLoading] = useState(false);
  const [loginCodigoError, setLoginCodigoError] = useState("");
  const [registered, setRegistered] = useState(false);
 
  async function loadParticipant(currentDeviceId: string) {
    setCheckingData(true);
    setDataError(null);

    try {
      const { data, error } = await supabase
        .from("project_participants")
        .select("*")
        .eq("device_id", currentDeviceId)
        .maybeSingle();

      if (error) throw new Error(error.message);

      setParticipant(data ?? null);
      setHasData(!!data);
    } catch (e: any) {
      setParticipant(null);
      setHasData(false);
      setDataError(e?.message ?? String(e));
    } finally {
      setCheckingData(false);
    }
  }

  async function handleLoginConCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginCodigoLoading(true);
    setLoginCodigoError("");

    const codigo = codigoAcceso.trim().toUpperCase();

    if (!codigo) {
      setLoginCodigoError("Ingresa tu código de acceso");
      setLoginCodigoLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("project_participants")
        .select("*")
        .eq("codigo_acceso", codigo)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        setLoginCodigoError("Código de acceso no válido");
        setLoginCodigoLoading(false);
        return;
      }

      if (!deviceId) {
        setLoginCodigoError("No se pudo identificar tu dispositivo.");
        setLoginCodigoLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("project_participants")
        .update({ device_id: deviceId })
        .eq("id", data.id);

      if (updateError) throw new Error(updateError.message);

      await loadParticipant(deviceId);
      setCodigoAcceso("");
      setLoginCodigoError("✅ Sesión iniciada correctamente");
      setTimeout(() => setLoginCodigoError(""), 3000);
    } catch (err: any) {
      setLoginCodigoError(err?.message || "Error al iniciar sesión");
    } finally {
      setLoginCodigoLoading(false);
    }
  }

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);
  useEffect(() => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  setRegistered(params.get("registered") === "true");
}, []);

  useEffect(() => {
    if (!deviceId) return;
    void loadParticipant(deviceId);
  }, [deviceId]);

  useEffect(() => {
    const visibleParts: string[] = [
      "Pantalla principal de Reto Ciudadano.",
      "Aquí se muestran los juegos disponibles del módulo.",
      "Juegos visibles: Reto principal y Camino Ciudadano.",
      "Reto principal es un juego secuencial por niveles con conocimiento general, partido y ruleta.",
      "Camino Ciudadano es un juego de recorrido por casillas con preguntas y avance progresivo.",
      "Si jugarás con premio, debes registrarte o iniciar sesión con tu código.",
      "Si jugarás sin premio, puedes entrar libremente.",
    ];

    if (registered) {
      visibleParts.push(
        "Se muestra confirmación de registro exitoso al volver desde la ficha general."
      );
    }

    if (checkingData) {
      visibleParts.push(
        "Se está verificando si ya existe una sesión activa del participante."
      );
    }

    if (hasData) {
      visibleParts.push(
        `Participante activo detectado: ${
          participant?.alias || participant?.full_name || "Participante activo"
        }.`
      );
    }

    if (dataError) {
      visibleParts.push(`Error visible al verificar acceso: ${dataError}`);
    }

    setPageContext({
  pageId: "reto-ciudadano",
  pageTitle: "Reto ciudadano",
  route: "/reto-ciudadano",
  summary:
    "Pantalla principal de Reto Ciudadano con acceso a sus juegos y a la lógica general de registro para premio.",
  speakableSummary:
    "Estás en Reto Ciudadano. Aquí puedes registrarte o iniciar sesión para participar en modalidades con premio, o entrar libremente a los juegos sin premio.",
  activeSection: checkingData ? "verificando-acceso" : "hub-reto-ciudadano",
  visibleText: visibleParts.join("\n"),
       availableActions: hasData
    ? ["Entrar al Reto principal", "Entrar a Camino Ciudadano", "Volver al inicio"]
    : [
        "Registrarme para jugar con premio",
        "Iniciar sesión con código",
        "Entrar al Reto principal",
        "Entrar a Camino Ciudadano",
        "Volver al inicio",
      ],
  suggestedPrompts: hasData
    ? [
        {
          id: "reto-hub-1",
          label: "¿Qué puedo hacer aquí?",
          question: "¿Qué puedo hacer ahora en esta pantalla de Reto Ciudadano?",
        },
        {
          id: "reto-hub-2",
          label: "¿Ya estoy habilitado?",
          question: "¿Ya aparezco con acceso habilitado para jugar con premio en Reto Ciudadano?",
        },
        {
          id: "reto-hub-3",
          label: "¿Cuál juego elijo?",
          question: "¿Qué diferencia hay entre Reto principal y Camino Ciudadano?",
        },
        {
          id: "reto-hub-4",
          label: "¿Cómo entro con premio?",
          question: "¿Cómo participo con premio desde esta pantalla de Reto Ciudadano?",
        },
      ]
    : [
        {
          id: "reto-hub-1",
          label: "¿Cómo participo?",
          question: "¿Cómo participo en Reto Ciudadano desde esta pantalla?",
        },
        {
          id: "reto-hub-2",
          label: "¿Premio o libre?",
          question: "¿Cuál es la diferencia entre jugar con premio y jugar sin premio en Reto Ciudadano?",
        },
        {
          id: "reto-hub-3",
          label: "¿Necesito registro?",
          question: "¿Necesito registrarme para jugar en Reto Ciudadano?",
        },
        {
          id: "reto-hub-4",
          label: "¿Qué juegos hay?",
          question: "¿Qué juegos están disponibles en esta pantalla de Reto Ciudadano?",
        },
      ],
  selectedItemTitle: hasData
    ? participant?.alias || participant?.full_name || "Reto Ciudadano"
    : "Reto Ciudadano",
      status: dataError ? "error" : checkingData ? "loading" : "ready",
      dynamicData: {
        subventanasDisponibles: 2,
        retoPrincipalVisible: true,
        caminoCiudadanoVisible: true,
        accesoVerificado: hasData,
        checkingData,
        participanteNombre: participant?.full_name ?? "",
        participanteAlias: participant?.alias ?? "",
        registered,
      },
    });

    return () => {
      clearPageContext();
    };
    }, [
  setPageContext,
  clearPageContext,
  checkingData,
  hasData,
  dataError,
  participant,
  registered,
]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 vc-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">
            RETO CIUDADANO
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Este módulo reúne varias experiencias de juego ciudadano.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Elige el juego al que quieres entrar.
          </p>
        </div>

        <div className="shrink-0 flex flex-col gap-2">
          <Link
            href="/"
            className="rounded-xl border px-3 py-2 text-sm font-semibold text-white bg-blue-600 border-blue-700 hover:bg-blue-700 text-center vc-btn-wave vc-btn-pulse"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm vc-fade-up">
        <div className="text-sm font-extrabold text-slate-900">
          Acceso general para premio
        </div>
        <p className="mt-2 text-sm text-slate-700">
          Si jugarás con premio, debes registrarte o iniciar sesión con tu código.
          Si jugarás sin premio, puedes entrar libremente.
        </p>

        {registered ? (
          <div className="mt-4 rounded-xl border bg-green-50 p-3 text-sm font-bold text-green-800">
            ✅ Registro completado. Ya puedes ingresar con tu código y participar
            en los juegos con premio.
          </div>
        ) : null}

        {checkingData ? (
          <div className="mt-4 rounded-xl border bg-white p-3 text-sm font-bold text-slate-800">
            Verificando si ya tienes una sesión activa como participante…
          </div>
        ) : null}

        {dataError ? (
          <div className="mt-4 rounded-xl border bg-red-50 p-3 text-sm font-bold text-red-700">
            Error al verificar datos: {dataError}
          </div>
        ) : null}

        {!checkingData && !hasData ? (
          <div className="mt-4 grid gap-4">
            <div className="flex gap-2 flex-wrap">
              <Link
                href="/proyecto-ciudadano/registro?returnTo=/reto-ciudadano"
                className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-extrabold bg-blue-600 text-white border-blue-700 hover:bg-blue-700 vc-btn-wave vc-btn-pulse"
              >
                Registrarme para participar
              </Link>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <h3 className="text-base font-extrabold text-slate-900 mb-2">
                🔑 Iniciar sesión con código
              </h3>
              <p className="text-sm text-slate-700 mb-3">
                Si ya tienes tu código de acceso, ingrésalo aquí para habilitar
                los juegos con premio.
              </p>

              {loginCodigoError ? (
                <div
                  className="mb-3 rounded-xl p-3 text-sm font-semibold"
                  style={{
                    backgroundColor: loginCodigoError.includes("✅")
                      ? "#f0fdf4"
                      : "#fee2e2",
                    border: loginCodigoError.includes("✅")
                      ? "1px solid #bbf7d0"
                      : "1px solid #fecaca",
                    color: loginCodigoError.includes("✅")
                      ? "#166534"
                      : "#dc2626",
                  }}
                >
                  {loginCodigoError}
                </div>
              ) : null}

              <form onSubmit={handleLoginConCodigo} className="grid gap-3">
                <input
                  type="text"
                  value={codigoAcceso}
                  onChange={(e) => setCodigoAcceso(e.target.value.toUpperCase())}
                  placeholder="Ej: EMP-2026-3A7F"
                  className="rounded-xl border px-3 py-2 text-sm"
                  disabled={loginCodigoLoading}
                />

                <button
                  type="submit"
                  className="w-full rounded-xl border px-4 py-2 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200 vc-btn-wave vc-btn-pulse"
                  disabled={loginCodigoLoading}
                >
                  {loginCodigoLoading ? "Verificando..." : "Iniciar sesión con código"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {!checkingData && hasData ? (
          <div className="mt-4 rounded-2xl border bg-green-50 p-4">
            <div className="text-sm font-extrabold text-green-800">
              Acceso habilitado
            </div>
            <div className="mt-1 text-sm text-slate-800 leading-relaxed">
              Ya puedes ingresar a las modalidades con premio desde los juegos de
              Reto Ciudadano.
            </div>
            <div className="mt-2 text-sm text-slate-800">
              Participante:{" "}
              <span className="font-extrabold">
                {participant?.full_name || "Participante activo"}
              </span>
            </div>

            {participant?.alias ? (
              <div className="mt-1 text-sm text-slate-800">
                Alias: <span className="font-extrabold">{participant.alias}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/reto-ciudadano/principal"
          className="rounded-2xl border bg-white p-5 shadow-sm hover:bg-slate-50 vc-fade-up vc-card-hover"
        >
          <div className="text-base font-extrabold text-slate-900">
            Reto principal
          </div>
          <div className="mt-2 text-sm text-slate-700">
            Juego secuencial por niveles: conocimiento general, partido y ruleta.
          </div>
        </Link>

        <Link
          href="/reto-ciudadano/camino"
          className="rounded-2xl border bg-white p-5 shadow-sm hover:bg-slate-50 vc-fade-up vc-card-hover"
        >
          <div className="text-base font-extrabold text-slate-900">
            Camino Ciudadano
          </div>
          <div className="mt-2 text-sm text-slate-700">
            Juego de recorrido por casillas donde avanzas, respondes preguntas y
            buscas llegar a la meta.
          </div>
        </Link>
      </section>
    </main>
  );
}