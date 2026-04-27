// src/lib/ciudadanoServiceContent.ts

export type CitizenEntity = "JNE" | "ONPE" | "RENIEC";

export type CitizenServiceLink = {
  title: string;
  entity: CitizenEntity;
  url: string;
  note?: string;
  description: string;
};

export const CIUDADANO_PAGE_TITLE = "Servicios al ciudadano";

export const CIUDADANO_PAGE_SUBTITLE =
  "Enlaces oficiales del Estado Peruano para consultas electorales, trámites y documentos públicos.";

export const CIUDADANO_LEGAL_NOTE =
  "⚠️ Nota importante: VOTO CLARO no pertenece ni representa a ninguna entidad del Estado. " +
  "Los enlaces mostrados dirigen a páginas oficiales públicas administradas por JNE, ONPE y RENIEC. " +
  "VOTO CLARO solo facilita el acceso informativo a estos sitios.";

export const CIUDADANO_PAGE_GUIDE =
  "Guía rápida:\n" +
  "1) Revisa la lista de servicios oficiales disponibles.\n" +
  "2) Lee la explicación debajo de cada tarjeta.\n" +
  "3) Toca “Abrir sitio oficial” para ir a la web de la entidad correspondiente.\n" +
  "4) Usa “Copiar enlace” si quieres guardar o compartir el acceso.\n\n" +
  "Puedes preguntarme por temas como: proceso electoral, multas, local de votación, miembro de mesa, " +
  "cédula de sufragio, padrón electoral, afiliación política, desafiliación, planes de gobierno, " +
  "historial político, candidatos o trámites RENIEC.";

export const CIUDADANO_SERVICES: CitizenServiceLink[] = [
  // =====================
  // ONPE
  // =====================
  {
    title: "Información del proceso electoral",
    entity: "ONPE",
    url: "https://eg2026.onpe.gob.pe/",
    note: "Elecciones Generales 2026",
    description:
      "Accede al portal oficial de la ONPE sobre el proceso electoral, con información para electores, fechas, cédula de sufragio y otros contenidos públicos.",
  },
  {
    title: "¿Soy miembro de mesa?",
    entity: "ONPE",
    url: "https://consultaelectoral.onpe.gob.pe/inicio",
    description:
      "Consulta si fuiste designado miembro de mesa usando el sistema oficial de la ONPE.",
  },
  {
    title: "Conoce tu local de votación",
    entity: "ONPE",
    url: "https://eg2026.onpe.gob.pe/para-electores/conoce-tu-local-de-votacion/",
    description:
      "Encuentra tu local de votación y datos relacionados a tu lugar de sufragio en el portal oficial de la ONPE.",
  },
  {
    title: "Cédula de sufragio",
    entity: "ONPE",
    url: "https://eg2026.onpe.gob.pe/cedula/cedula-de-sufragio/",
    description:
      "Revisa información pública relacionada con la cédula de sufragio publicada por la ONPE.",
  },

  // =====================
  // JNE
  // =====================
  {
    title: "Servicios al ciudadano",
    entity: "JNE",
    url: "https://portal.jne.gob.pe/portal",
    description:
      "Accede al portal del JNE para consultar servicios y trámites públicos relacionados con el sistema electoral.",
  },
  {
    title: "Multas electorales",
    entity: "JNE",
    url: "https://multas.jne.gob.pe/login",
    description:
      "Consulta y gestiona información sobre multas electorales en el portal oficial del JNE.",
  },
  {
    title: "Consulta de afiliación política",
    entity: "JNE",
    url: "https://sroppublico.jne.gob.pe/Consulta/Afiliado",
    description:
      "Consulta si una persona registra afiliación a una organización política en el sistema público del JNE.",
  },
  {
    title: "Desafiliarme de un partido político",
    entity: "JNE",
    url: "https://mesapartesvirtual.jne.gob.pe/login",
    description:
      "Accede a la Mesa de Partes Virtual del JNE para iniciar o presentar trámites relacionados con una organización política, según corresponda.",
  },
  {
    title: "Cómo desafiliarme de una organización política",
    entity: "JNE",
    url: "https://portal.jne.gob.pe/portal/Pagina/Ver/923/page/Desafiliacion-a-una-organizacion-politica",
    note: "Guía informativa",
    description:
      "Revisa la información oficial del JNE sobre el procedimiento de desafiliación a una organización política.",
  },
  {
    title: "Historial político de candidatos y partidos",
    entity: "JNE",
    url: "https://infogob.jne.gob.pe/",
    note: "InfoGob",
    description:
      "Consulta información histórica sobre candidatos, autoridades, organizaciones políticas y procesos electorales en el portal InfoGob del JNE.",
  },
  {
    title: "Búsqueda avanzada de candidato",
    entity: "JNE",
    url: "https://plataformaelectoral.jne.gob.pe/candidatos/busqueda-avanzada/buscar",
    description:
      "Busca candidatos por filtros como organización política, región u otros criterios disponibles en la plataforma electoral oficial.",
  },
  {
    title: "Planes de gobierno y planes de trabajo",
    entity: "JNE",
    url: "https://plataformaelectoral.jne.gob.pe/candidatos/plan-gobierno-trabajo/buscar",
    description:
      "Revisa planes de gobierno o planes de trabajo publicados en la plataforma electoral oficial.",
  },
  {
    title: "Cronograma electoral (PDF oficial)",
    entity: "JNE",
    url: "https://portal.jne.gob.pe/portal_documentos/files/6870074e-526d-4cea-a9de-110a464de7a3.pdf",
    note: "Documento oficial",
    description:
      "Descarga el documento oficial con fechas y etapas del proceso electoral en formato PDF.",
  },

  // =====================
  // RENIEC
  // =====================
  {
    title: "Padrón electoral",
    entity: "RENIEC",
    url: "https://identidad.reniec.gob.pe/elecciones-generales-2026",
    note: "Elecciones Generales 2026",
    description:
      "Accede al portal de RENIEC relacionado con el padrón electoral y la información de identidad vinculada al proceso electoral.",
  },
  {
    title: "Trámites virtuales de identidad",
    entity: "RENIEC",
    url: "https://identidad.reniec.gob.pe/ciudadano",
    description:
      "Accede a trámites y servicios digitales de identidad disponibles en el portal oficial de RENIEC.",
  },
];