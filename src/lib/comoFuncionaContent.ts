// src/lib/comoFuncionaContent.ts

export const COMO_FUNCIONA_ROUTE = "/como-funciona";

export const COMO_FUNCIONA_GUIDE =
  "Estás en “Cómo funciona”.\n\n" +
  "Aquí explico cómo usar Voto Claro, qué hace el asistente, y notas sobre fuentes/uso.\n\n" +
  "Temas que puedes preguntar:\n" +
  "- “políticas de uso”\n" +
  "- “privacidad / datos”\n" +
  "- “fuentes”\n" +
  "- “cómo buscar candidato”\n" +
  "- “voz / micrófono”\n" +
  "- “HV, Plan, Actuar político”";

type FaqItem = {
  title: string;
  keywords: string[];
  answer: string;
};

export const COMO_FUNCIONA_FAQ: FaqItem[] = [
  {
    title: "Políticas de uso",
    keywords: ["politicas", "políticas", "uso", "terminos", "términos", "reglas"],
    answer:
      "Políticas de uso:\n\n" +
      "- El asistente guía y resume información según la sección.\n" +
      "- En HV/Plan responde con evidencia del PDF (citando páginas).\n" +
      "- En Actuar político usa el JSON local del candidato y muestra enlaces si están disponibles.\n" +
      "- Si una respuesta no tiene evidencia suficiente, lo indicaré.\n\n" +
      "Si me dices qué parte exacta de “Políticas de uso” estás viendo, te la explico punto por punto."
  },
  {
    title: "Privacidad y datos",
    keywords: ["privacidad", "datos", "data", "cookies", "localstorage", "sessionstorage"],
    answer:
      "Privacidad y datos:\n\n" +
      "- La app puede guardar preferencias como voz ON/OFF, idioma, posición del botón y memoria corta en el navegador (LocalStorage/SessionStorage).\n" +
      "- Eso sirve para que la experiencia sea consistente.\n\n" +
      "Si quieres, te digo exactamente qué claves se guardan y para qué (por ejemplo: voz, idioma, memoria corta)."
  },
  {
    title: "Fuentes",
    keywords: ["fuentes", "evidencia", "pdf", "documento", "citas", "paginas", "páginas"],
    answer:
      "Fuentes:\n\n" +
      "- En HV y Plan, el asistente debe responder SOLO con lo que esté en el PDF y citar páginas (p. X).\n" +
      "- Si no hay evidencia en el PDF, se responde: “No hay evidencia suficiente en las fuentes consultadas”."
  },
  {
    title: "Voz / micrófono",
    keywords: ["voz", "audio", "habla", "no habla", "no se escucha", "micro", "micrófono", "dictar", "no me escucha"],
    answer:
      "Voz / micrófono:\n\n" +
      "- Si no habla, primero haz un clic/toque en la pantalla (bloqueo normal del navegador).\n" +
      "- Para dictar, usa 🎙️ Hablar y revisa permisos del navegador si falla.\n" +
      "- Algunas PCs solo funcionan bien en Chrome."
  },
  {
    title: "Cómo buscar candidato",
    keywords: ["buscar", "candidato", "inicio", "home", "lista"],
    answer:
      "Cómo buscar candidato:\n\n" +
      "1) Ve a Inicio (/).\n" +
      "2) Escribe al menos 2 letras en “Buscar candidato”.\n" +
      "3) Abre la ficha para ver HV, Plan o Actuar político."
  }
];