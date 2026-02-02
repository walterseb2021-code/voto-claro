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
  "⚠️ Nota importante: VotoClaro no pertenece ni representa a ninguna entidad del Estado. " +
  "Los enlaces mostrados dirigen a páginas oficiales públicas administradas por JNE, ONPE y RENIEC. " +
  "VotoClaro solo facilita el acceso informativo a estos sitios.";

export const CIUDADANO_PAGE_GUIDE =
  "Guía rápida:\n" +
  "1) Revisa la lista de servicios.\n" +
  "2) Lee la explicación debajo de cada botón.\n" +
  "3) Toca “Abrir sitio oficial” para ir a la web de la entidad (se abre en una pestaña nueva).\n\n" +
  "Si quieres, dime el nombre del servicio (por ejemplo “multas”, “miembro de mesa”, “local de votación”) " +
  "y te leo su explicación y el enlace.";

export const CIUDADANO_SERVICES: CitizenServiceLink[] = [
  // =====================
  // JNE
  // =====================
  {
    title: "Servicios al ciudadano",
    entity: "JNE",
    url: "https://portal.jne.gob.pe/portal",
    description:
      "Accede al portal del JNE para consultar servicios y trámites públicos relacionados al sistema electoral.",
  },
  {
    title: "Multas electorales",
    entity: "JNE",
    url: "https://multas.jne.gob.pe/login",
    description:
      "Consulta y gestiona información sobre multas electorales en el portal oficial del JNE.",
  },
  {
    title: "Búsqueda avanzada de candidato",
    entity: "JNE",
    url: "https://plataformaelectoral.jne.gob.pe/candidatos/busqueda-avanzada/buscar",
    description:
      "Busca candidatos por filtros (por ejemplo organización política, región u otros criterios disponibles en la plataforma oficial).",
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
      "Descarga el documento oficial con fechas y etapas del proceso electoral (formato PDF).",
  },

  // =====================
  // ONPE
  // =====================
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
      "Revisa información pública relacionada a la cédula de sufragio publicada por la ONPE.",
  },

  // =====================
  // RENIEC
  // =====================
  {
    title: "Trámites virtuales de identidad",
    entity: "RENIEC",
    url: "https://identidad.reniec.gob.pe/ciudadano",
    description:
      "Accede a trámites y servicios digitales de identidad disponibles en el portal oficial de RENIEC.",
  },
];
