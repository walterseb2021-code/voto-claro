// src/lib/comoFuncionaContent.ts

export const COMO_FUNCIONA_ROUTE = "/como-funciona";

export const COMO_FUNCIONA_GUIDE =
  "Estás en “Cómo funciona VOTO CLARO”.\n\n" +
  "Esta ventana explica la app completa: cómo orientarte, qué rutas existen, cómo ayuda el Asistente, cuáles son sus límites técnicos y qué reglas de uso conviene respetar.\n\n" +
  "Temas que puedes preguntar con tus palabras:\n" +
  "- “qué es VOTO CLARO” / “para qué sirve”\n" +
  "- “cómo uso la app” / “flujo general”\n" +
  "- “qué hace el asistente” / “cómo me ayuda”\n" +
  "- “secciones de la app” / “qué hay en cada ventana”\n" +
  "- “voz” / “micrófono” / “no habla”\n" +
  "- “límites técnicos” / “qué pasa si falla”\n" +
  "- “política de uso” / “reglas”\n" +
  "- “transparencia” / “autoría” / “es oficial”.";

type FaqItem = {
  title: string;
  keywords: string[];
  answer: string;
};

export const COMO_FUNCIONA_FAQ: FaqItem[] = [
  {
    title: "¿Qué es VOTO CLARO?",
    keywords: [
      "que es voto claro",
      "qué es voto claro",
      "que es esto",
      "qué es esto",
      "para que sirve voto claro",
      "para qué sirve voto claro",
      "para que sirve la plataforma",
      "para qué sirve la plataforma",
      "de que trata voto claro",
      "de qué trata voto claro",
      "para que fue creada",
      "por que existe",
      "por qué existe",
      "me dice por quien votar",
      "me dice por quién votar",
    ],
    answer:
      "VOTO CLARO es una plataforma política y ciudadana para informarte, reflexionar y participar.\n\n" +
      "No es solo un buscador de candidatos. También reúne servicios ciudadanos, reflexión antes de votar, intención de voto, comentarios ciudadanos, proyectos ciudadanos, espacio emprendedor, reto ciudadano y una sección de ganadores.\n\n" +
      "La app no decide por ti ni te dice por quién votar. Su función es ordenar información, abrir rutas de participación y ayudarte a tomar decisiones con más criterio.",
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
      "flujo general",
      "guia",
      "guía",
      "como navegar",
      "cómo navegar",
      "usar la app",
      "uso de la app",
    ],
    answer:
      "La app se usa eligiendo una ruta según lo que quieres hacer.\n\n" +
      "Si quieres informarte, empieza por Inicio y revisa candidatos o contenidos institucionales. Si quieres tomar una decisión con más criterio, entra a Reflexionar antes de votar. Si buscas orientación práctica, usa Servicios al ciudadano. Si quieres participar, entra a Comentarios ciudadanos, Proyecto ciudadano o Reto Ciudadano. Si tienes una iniciativa productiva, revisa Espacio emprendedor. Si quieres ver resultados públicos de dinámicas con premio, entra a Solo para ganadores.\n\n" +
      "La idea general es: primero eliges tu intención, luego entras a la ventana correcta, después preguntas al Asistente según lo que ves y finalmente revisas la información con calma.",
  },

  {
    title: "¿Cómo te ayuda el Asistente?",
    keywords: [
      "que hace el asistente",
      "qué hace el asistente",
      "para que sirve el asistente",
      "para qué sirve el asistente",
      "como ayuda el asistente",
      "cómo ayuda el asistente",
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
      "leeme",
      "léeme",
      "me guia",
      "me guía",
      "orienta",
      "me orienta",
    ],
    answer:
      "El Asistente te ayuda según la ventana donde estás.\n\n" +
      "En Inicio puede orientarte sobre qué ruta abrir. En fichas de candidatos puede ayudarte con Hoja de Vida, Plan y Actuar político. En Comentarios ciudadanos, Proyecto ciudadano, Espacio emprendedor, Reto Ciudadano, Intención de voto y Solo para ganadores debe responder de acuerdo con el contexto visible.\n\n" +
      "También puede leer en voz alta si activas la voz. Si preguntas algo que no corresponde a la ventana actual, debe orientarte hacia la sección correcta en lugar de inventar.",
  },

  {
    title: "¿Qué secciones tiene VOTO CLARO?",
    keywords: [
      "secciones",
      "secciones de la app",
      "que secciones tiene",
      "qué secciones tiene",
      "enumera las secciones",
      "lista de secciones",
      "que ventanas tiene",
      "qué ventanas tiene",
      "ventanas",
      "modulos",
      "módulos",
      "opciones",
      "menu",
      "menú",
      "mapa",
      "mapa de la app",
      "que hay en cada ventana",
      "qué hay en cada ventana",
      "que puedo ver en la app",
      "qué puedo ver en la app",
      "que contiene la app",
      "qué contiene la app",
      "que hay en la app",
      "qué hay en la app",
    ],
    answer:
      "VOTO CLARO tiene varias secciones, y cada una cumple una función distinta:\n\n" +
      "1. Inicio: centro de navegación para abrir las rutas principales de la plataforma.\n" +
      "2. Buscar candidato y ficha del candidato: permite revisar Hoja de Vida, Plan de Gobierno y Actuar político.\n" +
      "3. Servicios al ciudadano: orienta hacia trámites y consultas electorales oficiales.\n" +
      "4. Reflexionar antes de votar: presenta preguntas por temas como economía, salud, educación, seguridad y otros ejes.\n" +
      "5. Alianza para el Progreso: espacio institucional del grupo activo en esta versión de la app.\n" +
      "6. Intención de voto: muestra una dinámica para registrar o explorar preferencias dentro de la plataforma.\n" +
      "7. Reto Ciudadano: espacio interactivo para aprender y participar mediante dinámicas o juegos.\n" +
      "8. Comentarios ciudadanos: permite opinar, comentar, debatir y participar sobre temas públicos.\n" +
      "9. Proyecto ciudadano: permite presentar ideas o propuestas para la comunidad.\n" +
      "10. Espacio emprendedor: orientado a proyectos productivos, emprendimientos y posibles conexiones.\n" +
      "11. Solo para ganadores: muestra eventos, ganadores, fotos, videos, entrevistas, premios y evidencias públicas.\n\n" +
      "Por eso la app no funciona como una sola ventana. Funciona como un recorrido con varias rutas.",
  },

  {
    title: "Voz, audio y micrófono",
    keywords: [
      "voz",
      "audio",
      "hablar",
      "que me hable",
      "que hable",
      "no habla",
      "no suena",
      "no hay audio",
      "microfono",
      "micrófono",
      "no me escucha",
      "no escucha",
      "dictar",
      "reconoce mi voz",
      "no reconoce mi voz",
      "no me entiende",
      "no entiende",
    ],
    answer:
      "La voz y el micrófono dependen del navegador y del dispositivo.\n\n" +
      "Si el Asistente no habla automáticamente, normalmente basta con tocar la pantalla o hacer clic una vez, porque muchos navegadores bloquean el audio hasta que el usuario interactúa.\n\n" +
      "Para dictar, usa el botón de micrófono si aparece disponible. Si no funciona, revisa permisos del navegador o prueba en un navegador compatible.",
  },

  {
    title: "Límites del sistema",
    keywords: [
      "limites",
      "límites",
      "limitaciones",
      "limites tecnicos",
      "límites técnicos",
      "fallas",
      "falla",
      "errores",
      "error",
      "no funciona",
      "no sirve",
      "se cuelga",
      "se congela",
      "se traba",
      "se pega",
      "se queda pensando",
      "no carga",
      "no abre",
      "pantalla en blanco",
      "porque responde mal",
      "por qué responde mal",
      "porque no responde",
      "por qué no responde",
    ],
    answer:
      "VOTO CLARO depende del navegador, del dispositivo, de la conexión y de los datos disponibles en la app.\n\n" +
      "El Asistente no debe inventar información. Si algo no existe en la plataforma, si una sección todavía no tiene datos publicados o si una fuente no está disponible, debe indicarlo con claridad.\n\n" +
      "También puede haber límites de audio, micrófono, carga de datos o permisos del navegador. En esos casos conviene actualizar la página, revisar permisos o probar desde otro dispositivo.",
  },

  {
    title: "Política de uso",
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
      "abuso",
      "comportamiento",
    ],
    answer:
      "VOTO CLARO debe usarse con respeto y con propósito ciudadano.\n\n" +
      "Puedes preguntar sobre las secciones, candidatos, servicios, reflexiones, participación, proyectos, emprendimientos, retos y ganadores visibles dentro de la app.\n\n" +
      "No corresponde usar la plataforma para insultar, atacar, manipular al Asistente, pedirle que invente información o intentar desarmar el funcionamiento técnico de la app.",
  },

  {
    title: "Transparencia y autoría",
    keywords: [
      "transparencia",
      "quien hizo",
      "quién hizo",
      "quien creo",
      "quién creó",
      "quien desarrollo",
      "quién desarrolló",
      "quien esta detras",
      "quién está detrás",
      "autor",
      "autoria",
      "autoría",
      "responsable",
      "es oficial",
      "es del gobierno",
      "es del estado",
      "es del jurado",
      "es del jne",
      "es de la onpe",
    ],
    answer:
      "VOTO CLARO es una herramienta informativa y ciudadana. No reemplaza fuentes oficiales ni el criterio personal del usuario.\n\n" +
      "Cuando necesites una consulta oficial, la app debe orientarte hacia servicios o enlaces institucionales cuando estén disponibles.\n\n" +
      "La transparencia también implica reconocer límites: si una información no está publicada o no aparece en la app, no debe presentarse como si estuviera confirmada.",
  },
];