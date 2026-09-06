"use client";

import { useState } from "react";

type ReviewStatus = "draft" | "approved" | "retired";
type EntityKind = "fact" | "template";

type Props = {
  kind: EntityKind;
  id: string;
  version: number;
  reviewStatus: ReviewStatus;
  isActive: boolean;
  sourceReference?: string | null;
  onNotice: (message: string | null) => void;
  onChanged: () => void | Promise<void>;
};

const btn =
  "inline-flex items-center justify-center rounded-xl px-3 py-2 " +
  "border-2 text-xs font-extrabold transition shadow-sm " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

const approveBtn = `${btn} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`;
const activateBtn = `${btn} border-amber-700 bg-amber-500 text-slate-950 hover:bg-amber-600`;
const retireBtn = `${btn} border-slate-700 bg-white text-slate-800 hover:bg-slate-100`;

function friendlyError(error: unknown): string {
  switch (error) {
    case "VERSION_CONFLICT":
      return "El registro cambió en otra sesion. Recarga el banco antes de continuar.";
    case "STATE_INVALID":
      return "El estado del registro cambió y ya no permite esta acción. Recarga el banco.";
    case "RUNTIME_CONTRACT_INVALID":
      return "La plantilla no cumple el contrato seguro de ejecucion. Corrige el borrador antes de aprobar.";
    case "NOT_FOUND":
      return "El registro ya no existe o no esta disponible.";
    case "INVALID_INPUT":
      return "La solicitud no cumple el contrato del servidor.";
    case "UNAUTHORIZED":
    case "AUTH_REQUIRED":
      return "La sesión administrativa ya no es valida. Vuelve a iniciar sesion.";
    default:
      return "No se pudo completar la operación.";
  }
}

export default function RetoBankLifecycleActions({
  kind,
  id,
  version,
  reviewStatus,
  isActive,
  sourceReference,
  onNotice,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);

  if (reviewStatus === "retired") {
    return null;
  }

  const noun = kind === "fact" ? "hecho" : "plantilla";
  const article = kind === "fact" ? "este" : "esta";
  const activationPronoun = kind === "fact" ? "activarlo" : "activarla";

  async function runApprove(activate: boolean) {
    if (reviewStatus !== "draft" || busy) {
      return;
    }

    let normalizedSource: string | null = null;

    if (kind === "fact") {
      normalizedSource =
        typeof sourceReference === "string" ? sourceReference.trim() : "";

      if (!normalizedSource) {
        onNotice(
          "Este hecho no tiene referencia de fuente. Edita el borrador y registra la fuente antes de aprobar."
        );
        return;
      }
    }

    const question = activate
      ? `¿Aprobar y ACTIVAR ${article} ${noun}? Esta operación cambia su estado y aumenta la versión.`
      : `¿Aprobar ${article} ${noun} SIN ${activationPronoun}? Esta operación cambia su estado y aumenta la versión.`;

    if (!window.confirm(question)) {
      return;
    }

    setBusy(true);
    onNotice(activate ? "Aprobando y activando..." : "Aprobando...");

    try {
      const url =
        kind === "fact"
          ? "/api/admin/reto/facts/approve"
          : "/api/admin/reto/templates/approve";

      const body =
        kind === "fact"
          ? {
              id,
              expected_version: version,
              source_reference: normalizedSource,
              activate,
            }
          : {
              id,
              expected_version: version,
              activate,
            };

      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onNotice(friendlyError(data?.error));
        return;
      }

      onNotice(
        activate
          ? `${kind === "fact" ? "Hecho" : "Plantilla"} aprobado y activado.`
          : `${kind === "fact" ? "Hecho" : "Plantilla"} aprobado sin activar.`
      );
      await onChanged();
    } catch {
      onNotice("Error de red durante la operación.");
    } finally {
      setBusy(false);
    }
  }

  async function runRetire() {
    if (reviewStatus === "retired" || busy) {
      return;
    }

    const activeWarning = isActive
      ? " Actualmente está ACTIVO y quedará inactivo."
      : "";

    if (
      !window.confirm(
        `¿Retirar ${article} ${noun}? Quedará en estado retired y no podrá volver a editarse.${activeWarning}`
      )
    ) {
      return;
    }

    setBusy(true);
    onNotice("Retirando...");

    try {
      const url =
        kind === "fact"
          ? "/api/admin/reto/facts/retire"
          : "/api/admin/reto/templates/retire";

      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          expected_version: version,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onNotice(friendlyError(data?.error));
        return;
      }

      onNotice(`${kind === "fact" ? "Hecho" : "Plantilla"} retirado.`);
      await onChanged();
    } catch {
      onNotice("Error de red durante la operación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {reviewStatus === "draft" && (
        <>
          <button
            type="button"
            className={approveBtn}
            disabled={busy}
            onClick={() => void runApprove(false)}
          >
            Aprobar
          </button>

          <button
            type="button"
            className={activateBtn}
            disabled={busy}
            onClick={() => void runApprove(true)}
          >
            Aprobar y activar
          </button>
        </>
      )}

      <button
        type="button"
        className={retireBtn}
        disabled={busy}
        onClick={() => void runRetire()}
      >
        Retirar
      </button>
    </>
  );
}