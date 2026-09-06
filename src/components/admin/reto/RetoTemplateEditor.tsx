"use client";

import { useEffect, useMemo, useState } from "react";

type FactType =
  | "boolean"
  | "integer"
  | "decimal"
  | "text"
  | "date"
  | "membership";

type EditableTemplate = {
  id: string;
  code: string;
  fact_type: string;
  operator_code: string;
  allowed_sources: string[];
  config: Record<string, unknown>;
  difficulty: number;
  renderer_version: number;
  review_status: "draft" | "approved" | "retired";
  version: number;
};

type Props = {
  editingTemplate: EditableTemplate | null;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
};

type FormState = {
  code: string;
  factType: FactType;
  sources: string[];
  difficulty: string;
  falseDeltaMin: string;
  falseDeltaMax: string;
  decimalStep: string;
  falseStepsMax: string;
};

const FACT_TYPES: FactType[] = [
  "boolean",
  "integer",
  "decimal",
  "text",
  "date",
  "membership",
];

const SOURCES = ["principal_level1", "principal_level2", "camino"] as const;

const OPERATOR_BY_FACT_TYPE: Record<FactType, string> = {
  boolean: "BOOL_EXPLICIT_VARIANT",
  integer: "INT_EQUALS_VARIANT",
  decimal: "DECIMAL_EQUALS_VARIANT",
  text: "TEXT_EQUALS_VARIANT",
  date: "DATE_EQUALS_VARIANT",
  membership: "MEMBERSHIP_DIRECT",
};

const TEMPLATE_CODE_RE = /^[a-z][a-z0-9_]{2,63}$/;
const DECIMAL_STEP_RE =
  /^(?:0\.\d{0,7}[1-9]|[1-9]\d{0,4}(?:\.\d{0,7}[1-9])?|100000)$/;

function blankForm(): FormState {
  return {
    code: "",
    factType: "boolean",
    sources: ["principal_level1"],
    difficulty: "1",
    falseDeltaMin: "1",
    falseDeltaMax: "5",
    decimalStep: "1",
    falseStepsMax: "5",
  };
}

function fromRow(row: EditableTemplate): FormState {
  const next = blankForm();
  const factType = FACT_TYPES.includes(row.fact_type as FactType)
    ? (row.fact_type as FactType)
    : "boolean";
  const config = row.config ?? {};

  next.code = row.code;
  next.factType = factType;
  next.sources = Array.isArray(row.allowed_sources)
    ? [...row.allowed_sources]
    : [];
  next.difficulty = String(row.difficulty);

  if (factType === "integer") {
    next.falseDeltaMin =
      typeof config.false_delta_min === "number"
        ? String(config.false_delta_min)
        : "1";
    next.falseDeltaMax =
      typeof config.false_delta_max === "number"
        ? String(config.false_delta_max)
        : "5";
  } else if (factType === "decimal") {
    next.decimalStep =
      typeof config.step === "string" ? config.step : "1";
    next.falseStepsMax =
      typeof config.false_steps_max === "number"
        ? String(config.false_steps_max)
        : "5";
  }

  return next;
}

function buildConfig(form: FormState): Record<string, unknown> {
  if (form.factType === "integer") {
    return {
      false_delta_min: Number(form.falseDeltaMin),
      false_delta_max: Number(form.falseDeltaMax),
    };
  }

  if (form.factType === "decimal") {
    return {
      step: form.decimalStep.trim(),
      false_steps_max: Number(form.falseStepsMax),
    };
  }

  return {};
}

export default function RetoTemplateEditor({
  editingTemplate,
  onCancelEdit,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());

  useEffect(() => {
    if (editingTemplate) {
      setForm(fromRow(editingTemplate));
      setOpen(true);
      setLocalNotice(null);
    }
  }, [editingTemplate]);

  const operator = useMemo(
    () => OPERATOR_BY_FACT_TYPE[form.factType],
    [form.factType]
  );

  function startCreate() {
    setForm(blankForm());
    setLocalNotice(null);
    setOpen(true);
    onCancelEdit();
  }

  function cancel() {
    setOpen(false);
    setLocalNotice(null);
    setForm(blankForm());
    onCancelEdit();
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setLocalNotice(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSource(source: string) {
    setLocalNotice(null);
    setForm((current) => {
      const exists = current.sources.includes(source);
      const sources = exists
        ? current.sources.filter((item) => item !== source)
        : [...current.sources, source];
      return { ...current, sources };
    });
  }

  async function save() {
    setSaving(true);
    setLocalNotice(null);

    try {
      const difficulty = Number(form.difficulty);
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
        throw new Error("La dificultad debe estar entre 1 y 5.");
      }

      if (form.sources.length < 1 || form.sources.length > 3) {
        throw new Error("Selecciona entre 1 y 3 fuentes.");
      }

      if (!editingTemplate) {
        const code = form.code.trim();
        if (!TEMPLATE_CODE_RE.test(code)) {
          throw new Error(
            "El codigo debe empezar con letra minuscula y usar solo letras minusculas, numeros o guion bajo (3 a 64 caracteres)."
          );
        }
      }

      if (form.factType === "integer") {
        const min = Number(form.falseDeltaMin);
        const max = Number(form.falseDeltaMax);
        if (
          !Number.isInteger(min) ||
          !Number.isInteger(max) ||
          min < 1 ||
          min > 100000 ||
          max < min ||
          max > 100000
        ) {
          throw new Error(
            "Para integer, el delta minimo debe ser 1..100000 y el maximo debe ser mayor o igual al minimo."
          );
        }
      }

      if (form.factType === "decimal") {
        const step = form.decimalStep.trim();
        const falseStepsMax = Number(form.falseStepsMax);

        if (!DECIMAL_STEP_RE.test(step)) {
          throw new Error(
            "Para decimal, step debe ser positivo, valido y no mayor de 100000."
          );
        }

        if (
          !Number.isInteger(falseStepsMax) ||
          falseStepsMax < 1 ||
          falseStepsMax > 1000
        ) {
          throw new Error(
            "Para decimal, false_steps_max debe estar entre 1 y 1000."
          );
        }
      }

      const common = {
        fact_type: form.factType,
        operator_code: operator,
        allowed_sources: form.sources,
        config: buildConfig(form),
        difficulty,
        renderer_version: 1,
      };

      const method = editingTemplate ? "PATCH" : "POST";
      const body = editingTemplate
        ? {
            id: editingTemplate.id,
            expected_version: editingTemplate.version,
            ...common,
          }
        : {
            code: form.code.trim(),
            ...common,
          };

      const res = await fetch("/api/admin/reto/templates", {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.error === "VERSION_CONFLICT") {
          throw new Error(
            "El registro cambio en otra sesion. Recarga el banco antes de editar."
          );
        }
        if (data?.error === "CREATE_CONFLICT") {
          throw new Error("Ya existe una plantilla con ese codigo.");
        }
        if (data?.error === "STATE_INVALID") {
          throw new Error(
            "El estado actual de la plantilla no permite editarla."
          );
        }
        throw new Error(data?.error ?? "No se pudo guardar la plantilla.");
      }

      setLocalNotice(
        editingTemplate ? "Borrador actualizado." : "Borrador creado."
      );
      setOpen(false);
      setForm(blankForm());
      onCancelEdit();
      await onSaved();
    } catch (error) {
      setLocalNotice(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la plantilla."
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm text-slate-900";
  const labelClass = "text-xs font-extrabold text-slate-900";
  const buttonClass =
    "inline-flex items-center justify-center rounded-xl border-2 border-red-600 bg-green-800 px-3 py-2 text-xs font-extrabold text-white hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div
      id="reto-template-editor"
      className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50 p-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-extrabold text-slate-900">
            Editor seguro de plantillas
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Crea o modifica borradores. Aprobar, activar y retirar se gestionan
            en una fase separada.
          </div>
        </div>

        <button
          type="button"
          className={buttonClass}
          disabled={saving}
          onClick={startCreate}
        >
          + Nueva plantilla
        </button>
      </div>

      {localNotice && (
        <div className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
          {localNotice}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <div className={labelClass}>Codigo</div>
              <input
                className={inputClass}
                value={form.code}
                readOnly={Boolean(editingTemplate)}
                onChange={(e) => setField("code", e.target.value)}
                placeholder="ejemplo_plantilla_01"
              />
              {editingTemplate && (
                <div className="mt-1 text-[11px] text-slate-600">
                  El codigo no puede cambiarse durante la edicion.
                </div>
              )}
            </label>

            <label>
              <div className={labelClass}>Tipo de hecho</div>
              <select
                className={inputClass}
                value={form.factType}
                onChange={(e) =>
                  setField("factType", e.target.value as FactType)
                }
              >
                {FACT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className={labelClass}>Dificultad</div>
              <select
                className={inputClass}
                value={form.difficulty}
                onChange={(e) => setField("difficulty", e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={String(value)}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className={labelClass}>Renderer version</div>
              <input className={inputClass} value="1" readOnly />
            </label>
          </div>

          <div>
            <div className={labelClass}>Fuentes permitidas</div>
            <div className="mt-2 flex gap-3 flex-wrap">
              {SOURCES.map((source) => (
                <label
                  key={source}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={form.sources.includes(source)}
                    onChange={() => toggleSource(source)}
                  />
                  {source}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className={labelClass}>Operador</div>
            <div className="mt-1 rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
              {operator}
            </div>
          </div>

          {form.factType === "integer" && (
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <div className={labelClass}>Delta falso minimo</div>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  className={inputClass}
                  value={form.falseDeltaMin}
                  onChange={(e) => setField("falseDeltaMin", e.target.value)}
                />
              </label>

              <label>
                <div className={labelClass}>Delta falso maximo</div>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  className={inputClass}
                  value={form.falseDeltaMax}
                  onChange={(e) => setField("falseDeltaMax", e.target.value)}
                />
              </label>
            </div>
          )}

          {form.factType === "decimal" && (
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <div className={labelClass}>Step decimal</div>
                <input
                  className={inputClass}
                  value={form.decimalStep}
                  onChange={(e) => setField("decimalStep", e.target.value)}
                  placeholder="1"
                />
              </label>

              <label>
                <div className={labelClass}>Pasos falsos maximos</div>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  className={inputClass}
                  value={form.falseStepsMax}
                  onChange={(e) => setField("falseStepsMax", e.target.value)}
                />
              </label>
            </div>
          )}

          {form.factType !== "integer" && form.factType !== "decimal" && (
            <div className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
              Este tipo usa configuracion vacia controlada: {"{}"}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving
                ? "Guardando..."
                : editingTemplate
                  ? "Guardar cambios"
                  : "Guardar borrador"}
            </button>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border-2 border-slate-500 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
              disabled={saving}
              onClick={cancel}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
