// src/lib/comoFuncionaContent.ts

export const COMO_FUNCIONA_ROUTE = "/como-funciona";

export const COMO_FUNCIONA_GUIDE =
  "Estás en “Cómo funciona”.\n\n" +
  "Aquí te explico cómo usar VOTO CLARO, qué hace el asistente, cuáles son sus límites y las reglas de uso.\n\n" +
  "Temas que puedes preguntar (con tus palabras):\n" +
  "- “qué es esto” / “para qué sirve”\n" +
  "- “cómo empiezo” / “cómo se usa”\n" +
  "- “qué hace el asistente” / “me puedes ayudar”\n" +
  "- “no habla” / “no me escucha” / “no funciona”\n" +
  "- “reglas” / “normas” / “buen uso”\n" +
  "- “qué hay en la app” / “secciones”\n" +
  "- “quién hizo la app” / “es oficial”";

type FaqItem = {
  title: string;
  keywords: string[];
  answer: string;
};

export const COMO_FUNCIONA_FAQ: FaqItem[] = [
  {
    title: "¿Qué es VOTO CLARO?",
    keywords: [
      "que es",
      "qué es",
      "que es esto",
      "qué es esto",
      "esto que es",
      "para que sirve",
      "para qué sirve",
      "para que es",
      "para qué es",
      "de que trata",
      "de qué trata",
      "que hace",
      "qué hace",
      "que hace la app",
      "para que fue creada",
      "por que existe",
      "por qué existe",
      "para que la hicieron",
      "es una red social",
      "es red social",
      "es como facebook",
      "es como tiktok",
      "es un juego",
      "es juego",
      "se juega",
      "sirve para jugar",
      "es para votar",
      "me dice por quien votar",
      "me dice por quién votar",
    ],
    answer:
      "VOTO CLARO es una aplicación informativa para ayudarte a entender información pública antes de votar. " +
      "No es un juego, no es una red social y no te dice por quién votar. " +
      "Te ayuda a revisar información y a tomar tu decisión con más claridad.",
  },

  {
    title: "¿Cómo se usa la app?",
    keywords: [
      "como se usa",
      "cómo se usa",
      "como usar",
      "cómo usar",
      "como funciona",
      "cómo funciona",
      "como empiezo",
      "cómo empiezo",
      "que hago primero",
      "qué hago primero",
      "por donde empiezo",
      "por dónde empiezo",
      "pasos",
      "paso a paso",
      "flujo",
      "guia",
      "guía",
      "como navegar",
      "cómo navegar",
      "donde busco",
      "dónde busco",
      "como busco",
      "cómo busco",
      "buscar candidato",
      "buscador",
      "no encuentro",
      "no lo encuentro",
      "no aparece",
      "no me sale",
    ],
    answer:
      "Uso recomendado: 1) En Inicio, busca un candidato. " +
      "2) Entra a su ficha y revisa sus secciones (Hoja de Vida, Plan y actividad pública). " +
      "3) Haz tus preguntas dentro de la sección que estés viendo. " +
      "4) Revisa la información con calma y luego decide tú.",
  },

  {
    title: "¿Cómo te ayuda el Asistente?",
    keywords: [
      "que hace el asistente",
      "qué hace el asistente",
      "para que sirve el asistente",
      "para qué sirve el asistente",
      "me ayuda",
      "me puedes ayudar",
      "me puede ayudar",
      "me ayudas",
      "me explica",
      "me puedes explicar",
      "explicame",
      "explícame",
      "me resume",
      "me puedes resumir",
      "resumen",
      "resumir",
      "me lee",
      "lee",
      "leer",
      "leeme",
      "léeme",
      "voz",
      "hablar",
      "que me hable",
      "que hable",
      "me guia",
      "me guía",
      "orienta",
      "me orienta",
    ],
    answer:
      "El Asistente responde según la sección donde te encuentres. " +
      "Puede explicarte y resumirte lo que estás viendo en la app, y también puede leer en voz alta si activas la voz. " +
      "Si le preguntas algo fuera de la sección actual, te guía para ir al lugar correcto.",
  },

  {
    title: "Límites del sistema",
    keywords: [
      "limites",
      "límites",
      "limitaciones",
      "no funciona",
      "no sirve",
      "fallas",
      "falla",
      "errores",
      "error",
      "se cuelga",
      "se congela",
      "se traba",
      "se pega",
      "se queda pensando",
      "no carga",
      "no abre",
      "pantalla en blanco",
      "porque no responde",
      "por que no responde",
      "por qué no responde",
      "porque responde mal",
      "por que responde mal",
      "porque no habla",
      "por que no habla",
      "no habla",
      "no suena",
      "no hay audio",
      "no me escucha",
      "no escucha",
      "microfono",
      "micrófono",
      "no me toma el micro",
      "no reconoce mi voz",
      "no me entiende",
      "no entiende",
    ],
    answer:
      "Esta aplicación depende del navegador y del dispositivo. " +
      "En algunos casos, el audio puede estar bloqueado hasta que hagas un clic o toque en la pantalla. " +
      "El asistente responde solo sobre la información disponible dentro de VOTO CLARO. " +
      "Si algo no está en la app, te lo dirá en lugar de inventarlo.",
  },

  {
    title: "Reglas de uso",
    keywords: [
      "reglas",
      "normas",
      "politica",
      "política",
      "politicas",
      "políticas",
      "uso",
      "buen uso",
      "uso correcto",
      "como debo usar",
      "cómo debo usar",
      "que puedo preguntar",
      "qué puedo preguntar",
      "puedo preguntar cualquier cosa",
      "puedo insultar",
      "insultos",
      "lisuras",
      "faltas de respeto",
      "reportar",
      "denunciar",
      "abuso",
      "comportamiento",
    ],
    answer:
      "Usa VOTO CLARO con respeto. " +
      "No está diseñada para insultar, atacar o generar contenido que no tenga que ver con su propósito informativo. " +
      "Haz preguntas relacionadas con lo que existe dentro de la aplicación.",
  },

  {
    title: "¿Qué encontrarás en cada sección?",
    keywords: [
      "que hay",
      "qué hay",
      "que hay en la app",
      "qué hay en la app",
      "que contiene",
      "qué contiene",
      "secciones",
      "opciones",
      "menu",
      "menú",
      "donde encuentro",
      "dónde encuentro",
      "mapa",
      "mapa de la app",
      "que puedo ver",
      "qué puedo ver",
      "que tiene",
      "qué tiene",
    ],
    answer:
      "En Inicio puedes buscar candidatos. " +
      "En la ficha de cada candidato encontrarás su información pública organizada por secciones. " +
      "Además, hay espacios para reflexionar antes de votar y una sección de servicios con enlaces oficiales para trámites y consultas.",
  },

  {
    title: "Transparencia",
    keywords: [
      "transparencia",
      "quien hizo",
      "quién hizo",
      "quien creo",
      "quién creó",
      "quien creo la app",
      "quién creó la app",
      "quien desarrollo",
      "quién desarrolló",
      "quien la hizo",
      "quién la hizo",
      "quien esta detras",
      "quién está detrás",
      "quien esta atras",
      "quién está atrás",
      "de donde sale",
      "de dónde sale",
      "quien la financio",
      "quién la financió",
      "financia",
      "autor",
      "autoria",
      "autoría",
      "equipo",
      "responsable",
      "quien responde",
      "quién responde",
      "es oficial",
      "es del gobierno",
      "es del estado",
      "es del jurado",
      "es del jne",
      "es de la onpe",
    ],
    answer:
      "Esta aplicación es una herramienta informativa para facilitar el acceso a información pública. " +
      "No reemplaza el criterio personal del usuario. " +
      "Si necesitas una fuente oficial específica, te puedo orientar a dónde encontrarla dentro de la app.",
  },
];