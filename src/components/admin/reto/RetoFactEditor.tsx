"use client";

import { useEffect, useMemo, useState } from "react";

type FactType =
  | "boolean"
  | "integer"
  | "decimal"
  | "text"
  | "date"
  | "membership";

type EditableFact = {
  id: string;
  fact_key: string;
  fact_type: string;
  lang: string;
  topic: string;
  fact_data: Record<string, unknown>;
  eligible_sources: string[];
  difficulty: number;
  source_reference: string | null;
  valid_from: string | null;
  valid_until: string | null;
  review_status: "draft" | "approved" | "retired";
  version: number;
};

type Props = {
  editingFact: EditableFact | null;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
};

type FormState = {
  factKey: string;
  factType: FactType;
  lang: string;
  topic: string;
  sources: string[];
  difficulty: string;
  sourceReference: string;
  validFrom: string;
  validUntil: string;
  statementTrue: string;
  statementFalse: string;
  subject: string;
  value: string;
  unit: string;
  falseAlternatives: string;
  dateValue: string;
  member: string;
  collection: string;
  isMember: "true" | "false";
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

function blankForm(): FormState {
  return {
    factKey: "",
    factType: "boolean",
    lang: "es",
    topic: "",
    sources: ["principal_level1"],
    difficulty: "1",
    sourceReference: "",
    validFrom: "",
    validUntil: "",
    statementTrue: "",
    statementFalse: "",
    subject: "",
    value: "",
    unit: "",
    falseAlternatives: "",
    dateValue: "",
    member: "",
    collection: "",
    isMember: "true",
  };
}

function isoToLocalInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  const local = new Date(
    parsed.getTime() - parsed.getTimezoneOffset() * 60_000
  );
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function fromRow(row: EditableFact): FormState {
  const next = blankForm();
  const factType = FACT_TYPES.includes(row.fact_type as FactType)
    ? (row.fact_type as FactType)
    : "boolean";
  const data = row.fact_data ?? {};

  next.factKey = row.fact_key;
  next.factType = factType;
  next.lang = row.lang;
  next.topic = row.topic;
  next.sources = Array.isArray(row.eligible_sources)
    ? [...row.eligible_sources]
    : [];
  next.difficulty = String(row.difficulty);
  next.sourceReference = row.source_reference ?? "";
  next.validFrom = isoToLocalInput(row.valid_from);
  next.validUntil = isoToLocalInput(row.valid_until);

  if (factType === "boolean") {
    next.statementTrue =
      typeof data.statement_true === "string" ? data.statement_true : "";
    next.statementFalse =
      typeof data.statement_false === "string" ? data.statement_false : "";
  } else if (
    factType === "integer" ||
    factType === "decimal" ||
    factType === "text"
  ) {
    next.subject = typeof data.subject === "string" ? data.subject : "";
    next.value =
      typeof data.value === "string" || typeof data.value === "number"
        ? String(data.value)
        : "";
    next.unit = typeof data.unit === "string" ? data.unit : "";

    if (factType === "text" && Array.isArray(data.false_alternatives)) {
      next.falseAlternatives = data.false_alternatives
        .filter((item): item is string => typeof item === "string")
        .join("\n");
    }
  } else if (factType === "date") {
    next.subject = typeof data.subject === "string" ? data.subject : "";
    next.dateValue = typeof data.value === "string" ? data.value : "";
  } else {
    next.member = typeof data.member === "string" ? data.member : "";
    next.collection =
      typeof data.collection === "string" ? data.collection : "";
    next.isMember = data.is_member === false ? "false" : "true";
  }

  return next;
}

function buildFactData(form: FormState): Record<string, unknown> {
  if (form.factType === "boolean") {
    return {
      statement_true: form.statementTrue.trim(),
      statement_false: form.statementFalse.trim(),
    };
  }

  if (form.factType === "integer") {
    const raw = form.value.trim();
    if (!raw) throw new Error("Ingresa el valor entero.");
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      throw new Error("El valor debe ser un numero entero valido.");
    }

    return {
      subject: form.subject.trim(),
      value,
      ...(form.unit.trim() ? { unit: form.unit.trim() } : {}),
    };
  }

  if (form.factType === "decimal") {
    return {
      subject: form.subject.trim(),
      value: form.value.trim(),
      ...(form.unit.trim() ? { unit: form.unit.trim() } : {}),
    };
  }

  if (form.factType === "text") {
    const falseAlternatives = form.falseAlternatives
      .split(/\r?\n/u)
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      subject: form.subject.trim(),
      value: form.value.trim(),
      false_alternatives: falseAlternatives,
    };
  }

  if (form.factType === "date") {
    return {
      subject: form.subject.trim(),
      value: form.dateValue,
    };
  }

  return {
    member: form.member.trim(),
    collection: form.collection.trim(),
    is_member: form.isMember === "true",
  };
}

export default function RetoFactEditor({
  editingFact,
  onCancelEdit,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => blankForm());
  const [saving, setSaving] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  useEffect(() => {
    if (editingFact) {
      setForm(fromRow(editingFact));
      setOpen(true);
      setLocalNotice(null);
    }
  }, [editingFact]);

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
      if (!form.lang.trim()) throw new Error("Ingresa el idioma.");
      if (!form.topic.trim()) throw new Error("Ingresa el tema.");
      if (form.sources.length < 1 || form.sources.length > 3) {
        throw new Error("Selecciona entre 1 y 3 fuentes.");
      }
      if (!editingFact && !form.factKey.trim()) {
        throw new Error("Ingresa la clave del hecho.");
      }

      const validFrom = localInputToIso(form.validFrom);
      const validUntil = localInputToIso(form.validUntil);
      if (form.validFrom && !validFrom) {
        throw new Error("La fecha inicial no es valida.");
      }
      if (form.validUntil && !validUntil) {
        throw new Error("La fecha final no es valida.");
      }
      if (
        validFrom &&
        validUntil &&
        Date.parse(validUntil) <= Date.parse(validFrom)
      ) {
        throw new Error("La fecha final debe ser posterior a la inicial.");
      }

      const common = {
        fact_type: form.factType,
        lang: form.lang.trim(),
        topic: form.topic.trim(),
        fact_data: buildFactData(form),
        eligible_sources: form.sources,
        difficulty,
        source_reference: form.sourceReference.trim() || null,
        valid_from: validFrom,
        valid_until: validUntil,
        allowed_operators: [operator],
      };

      const method = editingFact ? "PATCH" : "POST";
      const body = editingFact
        ? {
            id: editingFact.id,
            expected_version: editingFact.version,
            ...common,
          }
        : {
            fact_key: form.factKey.trim(),
            ...common,
          };

      const res = await fetch("/api/admin/reto/facts", {
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
          throw new Error("Ya existe un hecho con esa clave.");
        }
        if (data?.error === "STATE_INVALID") {
          throw new Error("El estado actual del hecho no permite editarlo.");
        }
        throw new Error(data?.error ?? "No se pudo guardar el hecho.");
      }

      setLocalNotice(editingFact ? "Borrador actualizado." : "Borrador creado.");
      setOpen(false);
      setForm(blankForm());
      onCancelEdit();
      await onSaved();
    } catch (error) {
      setLocalNotice(
        error instanceof Error ? error.message : "No se pudo guardar el hecho."
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
      id="reto-fact-editor"
      className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50 p-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-extrabold text-slate-900">
            Editor seguro de hechos
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Los nuevos registros se guardan como borradores. Aprobar y activar
            siguen siendo acciones separadas.
          </div>
        </div>

        {!open && (
          <button type="button" className={buttonClass} onClick={startCreate}>
            + Nuevo hecho
          </button>
        )}
      </div>

      {localNotice && (
        <div className="mt-3 rounded-xl border border-red-400 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
          {localNotice}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-4">
          <div className="text-sm font-extrabold text-slate-900">
            {editingFact ? "Editar borrador" : "Crear nuevo borrador"}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <div className={labelClass}>Clave del hecho</div>
              <input
                className={inputClass}
                value={form.factKey}
                readOnly={Boolean(editingFact)}
                onChange={(e) => setField("factKey", e.target.value)}
                placeholder="ejemplo.hecho_001"
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Al editar, la clave no puede cambiarse.
              </div>
            </label>

            <label>
              <div className={labelClass}>Tipo</div>
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
              <div className={labelClass}>Idioma</div>
              <input
                className={inputClass}
                value={form.lang}
                maxLength={20}
                onChange={(e) => setField("lang", e.target.value)}
              />
            </label>

            <label>
              <div className={labelClass}>Dificultad</div>
              <select
                className={inputClass}
                value={form.difficulty}
                onChange={(e) => setField("difficulty", e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <div className={labelClass}>Tema</div>
            <input
              className={inputClass}
              value={form.topic}
              maxLength={240}
              onChange={(e) => setField("topic", e.target.value)}
            />
          </label>

          <div>
            <div className={labelClass}>Fuentes elegibles</div>
            <div className="mt-2 flex gap-3 flex-wrap">
              {SOURCES.map((source) => (
                <label
                  key={source}
                  className="flex items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
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

          <div className="rounded-xl border border-red-300 bg-white p-3 text-xs text-slate-700">
            Operador automatico: <b>{operator}</b>
          </div>

          {form.factType === "boolean" && (
            <div className="grid gap-3">
              <label>
                <div className={labelClass}>Enunciado verdadero</div>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.statementTrue}
                  onChange={(e) => setField("statementTrue", e.target.value)}
                />
              </label>
              <label>
                <div className={labelClass}>Enunciado falso</div>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.statementFalse}
                  onChange={(e) => setField("statementFalse", e.target.value)}
                />
              </label>
            </div>
          )}

          {(form.factType === "integer" ||
            form.factType === "decimal" ||
            form.factType === "text") && (
            <div className="grid gap-3">
              <label>
                <div className={labelClass}>Sujeto / pregunta base</div>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.subject}
                  onChange={(e) => setField("subject", e.target.value)}
                />
              </label>

              <label>
                <div className={labelClass}>
                  {form.factType === "text" ? "Respuesta correcta" : "Valor"}
                </div>
                <input
                  className={inputClass}
                  value={form.value}
                  onChange={(e) => setField("value", e.target.value)}
                />
              </label>

              {(form.factType === "integer" ||
                form.factType === "decimal") && (
                <label>
                  <div className={labelClass}>Unidad (opcional)</div>
                  <input
                    className={inputClass}
                    value={form.unit}
                    maxLength={80}
                    onChange={(e) => setField("unit", e.target.value)}
                  />
                </label>
              )}

              {form.factType === "text" && (
                <label>
                  <div className={labelClass}>
                    Alternativas falsas (una por linea)
                  </div>
                  <textarea
                    className={inputClass}
                    rows={5}
                    value={form.falseAlternatives}
                    onChange={(e) =>
                      setField("falseAlternatives", e.target.value)
                    }
                  />
                </label>
              )}
            </div>
          )}

          {form.factType === "date" && (
            <div className="grid gap-3">
              <label>
                <div className={labelClass}>Sujeto / pregunta base</div>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.subject}
                  onChange={(e) => setField("subject", e.target.value)}
                />
              </label>
              <label>
                <div className={labelClass}>Fecha correcta</div>
                <input
                  type="date"
                  className={inputClass}
                  value={form.dateValue}
                  onChange={(e) => setField("dateValue", e.target.value)}
                />
              </label>
            </div>
          )}

          {form.factType === "membership" && (
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <div className={labelClass}>Miembro / elemento</div>
                <input
                  className={inputClass}
                  value={form.member}
                  onChange={(e) => setField("member", e.target.value)}
                />
              </label>
              <label>
                <div className={labelClass}>Coleccion / conjunto</div>
                <input
                  className={inputClass}
                  value={form.collection}
                  onChange={(e) => setField("collection", e.target.value)}
                />
              </label>
              <label>
                <div className={labelClass}>Pertenece</div>
                <select
                  className={inputClass}
                  value={form.isMember}
                  onChange={(e) =>
                    setField("isMember", e.target.value as "true" | "false")
                  }
                >
                  <option value="true">Si</option>
                  <option value="false">No</option>
                </select>
              </label>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <div className={labelClass}>Referencia de fuente (opcional)</div>
              <input
                className={inputClass}
                value={form.sourceReference}
                onChange={(e) => setField("sourceReference", e.target.value)}
              />
            </label>
            <div />

            <label>
              <div className={labelClass}>Valido desde (opcional)</div>
              <input
                type="datetime-local"
                className={inputClass}
                value={form.validFrom}
                onChange={(e) => setField("validFrom", e.target.value)}
              />
            </label>

            <label>
              <div className={labelClass}>Valido hasta (opcional)</div>
              <input
                type="datetime-local"
                className={inputClass}
                value={form.validUntil}
                onChange={(e) => setField("validUntil", e.target.value)}
              />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving
                ? "Guardando..."
                : editingFact
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
