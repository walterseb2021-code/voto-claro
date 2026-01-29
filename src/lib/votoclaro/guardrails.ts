// src/lib/votoclaro/guardrails.ts

export type QuestionMode = "HV" | "WEB";

export type GuardrailDecision =
  | { ok: true; mode: QuestionMode }
  | { ok: false; reason: string; mode?: QuestionMode };

const PRIVATE_TOPICS_PATTERNS: RegExp[] = [
  // familia / vida íntima / sexualidad / salud privada
  /\b(esposa|esposo|pareja|novia|novio|hijos?|familia|padre|madre|herman[oa]s?)\b/i,
  /\b(sexual|sexo|orientaci[oó]n sexual|intimidad)\b/i,
  /\b(enfermedad|diagn[oó]stico|historial m[eé]dico|salud mental)\b/i,
  /\b(alcoh[oó]lico|alcoholismo|drogas|adicci[oó]n)\b/i,

  // datos personales sensibles
  /\b(direcci[oó]n|tel[eé]fono|n[uú]mero|dni|correo)\b/i,
];

// Palabras que suelen indicar “pregunta HV”
const HV_HINTS: RegExp[] = [
  /\b(hoja de vida|hv|jne)\b/i,
  /\b(organizaci[oó]n pol[ií]tica|partido|afiliaci[oó]n)\b/i,
  /\b(estudios|formaci[oó]n|t[ií]tulo|universidad)\b/i,
  /\b(ingresos|rentas|bienes|patrimonio|declaraci[oó]n jurada)\b/i,
  /\b(sentencia|condena|antecedentes|procesos)\b/i,
];

// Palabras que suelen indicar “pregunta web / interés público”
const WEB_HINTS: RegExp[] = [
  /\b(denuncia|denuncias|investigaci[oó]n|fiscal[ií]a|corrupci[oó]n)\b/i,
  /\b(proceso|juicio|imputaci[oó]n|acusaci[oó]n|congreso|contralor[ií]a)\b/i,
  /\b(noticia|reportaje|informe|idl|ojo p[uú]blico|rpp|el comercio|la rep[uú]blica|andina|el peruano)\b/i,
];

export function decideQuestionMode(question: string): QuestionMode {
  const q = question.trim();

  const hvScore = HV_HINTS.reduce((acc, r) => (r.test(q) ? acc + 1 : acc), 0);
  const webScore = WEB_HINTS.reduce((acc, r) => (r.test(q) ? acc + 1 : acc), 0);

  // Si empatan, por defecto WEB (porque HV exige PDF y citas por página)
  return hvScore > webScore ? "HV" : "WEB";
}

export function guardrailsCheck(question: string): GuardrailDecision {
  const q = question.trim();

  if (!q || q.length < 3) {
    return { ok: false, reason: "La pregunta es demasiado corta." };
  }

  for (const r of PRIVATE_TOPICS_PATTERNS) {
    if (r.test(q)) {
      return {
        ok: false,
        reason:
          "Esta pregunta se refiere a aspectos de la vida privada que no guardan relación directa con el ejercicio de la función pública. VotoClaro no responde este tipo de consultas.",
      };
    }
  }

  const mode = decideQuestionMode(q);
  return { ok: true, mode };
}
