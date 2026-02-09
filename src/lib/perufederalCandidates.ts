export type Candidate = {
  id: string;
  name: string;
  dni?: string;
  cargo: string;
  photo: string;

  // Región electoral o departamento (ej: "LIMA", "CUSCO", "PIURA")
  region: string;

  // Ruta pública del PDF en /public (ej: "/docs/persona/nombre_hv.pdf")
  profileLink: string; // link a YouTube, Facebook, web, etc.

};

export type CandidateGroup = {
  category:
    | "PRESIDENCIAL"
    | "PARLAMENTO_ANDINO"
    | "DIPUTADOS"
    | "SENADORES_DISTRITO_UNICO"
    | "SENADORES_DISTRITO_MULTIPLE";
  candidates: Candidate[];
};

export const CANDIDATE_GROUPS: CandidateGroup[] = [
  {
    category: "PRESIDENCIAL",
    candidates: [
      {
        id: "armando-joaquin-masse-fernandez",
        name: "Armando Joaquín Massé Fernández",
        cargo: "Presidente",
        dni: undefined,
        photo: "/candidates/armando-joaquin-masse-fernandez.png",
        region: "PERÚ",
        profileLink:
  "https://www.youtube.com/watch?v=JV07CFRt0G4",

      },
      {
        id: "virgilio-acuña-peralta",
        name: "virgilio acuña peralta",
        cargo: "Vicepresidente",
        dni: undefined,
        photo: "/candidates/virgilio-acuña-peralta.png",
        region: "PERÚ",
         profileLink:
  "https://www.youtube.com/watch?v=vfVlvWNhMMk",
      },
    ],
  },
  {
    category: "PARLAMENTO_ANDINO",
    candidates: [
      {
        id: "diana-doris-carhuamaca-garcia",
        name: "Diana Doris Carhuamaca García",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/diana-doris-carhuamaca-garcia.png",
        region: "PERÚ",
         profileLink:
  "https://perufederal.pe/armando-masse-defendio-su-experiencia-como-lider-de-apdayc-resaltando-logros-financieros-y-administrativos/",
      },
      {
        id: "agustin-huaman-varrera",
        name: "Agustín Huamán Varrera",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/agustin-huaman-varrera.png",
        region: "PERÚ",
         profileLink:
  "https://perufederal.pe/armando-masse-defendio-su-experiencia-como-lider-de-apdayc-resaltando-logros-financieros-y-administrativos/",
      },
    ],
  },
  {
    category: "DIPUTADOS",
    candidates: [
      {
        id: "diana-doris-carhuamaca-garcia",
        name: "Diana Doris Carhuamaca García",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/diana-doris-carhuamaca-garcia.png",
        region: "LIMA",
         profileLink:
      "https://www.youtube.com/watch?v=XXXXXXXX",
      },
      {
        id: "agustin-huaman-varrera",
        name: "Agustín Huamán Varrera",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/agustin-huaman-varrera.png",
        region: "LIMA",
         profileLink:
  "https://www.youtube.com/watch?v=Li0H3QHfnA8",
      },
    ],
  },
  {
    category: "SENADORES_DISTRITO_UNICO",
    candidates: [
      {
        id: "luis-bernardo-guerrero-figueroa",
        name: "Luis Bernardo Guerrero Figueroa",
        cargo: "Senador Distrito Único",
        dni: undefined,
        photo: "/candidates/luis-bernardo-guerrero-figueroa.png",
        region: "PERÚ",
        profileLink:
  "https://www.youtube.com/watch?v=hkiPF1Rq7EM",
      },
      {
        id: "jose-antonio-fernandez-cordova",
        name: "jose antonio fernandez cordova",
        cargo: "Senador Distrito Único",
        dni: undefined,
        photo: "/candidates/jose-antonio-fernandez-cordova.png",
        region: "PERÚ",
         profileLink:
  "https://www.youtube.com/watch?v=Li0H3QHfnA8",
    },
    ],
  },
  {
    category: "SENADORES_DISTRITO_MULTIPLE",
    candidates: [
      {
        id: "elizabeth-alfaro-espinoza",
        name: "elizabeth alfaro espinoza",
        cargo: "Senador Distrito Múltiple",
        dni: undefined,
        photo: "/candidates/elizabeth-alfaro-espinoza.png",
        region: "ANCASH",
         profileLink:
  "https://www.youtube.com/watch?v=Bw252-6kbiI",
      },
      {
        id: "jose-antonio-fernandez-cordova",
        name: "jose antonio fernandez cordova",
        cargo: "Senador Distrito Múltiple",
        dni: undefined,
        photo: "/candidates/jose-antonio-fernandez-cordova.png",
        region: "ANCASH",
         profileLink:
  "https://www.youtube.com/watch?v=aBEDDzyNxw0",
      },
    ],
  },
];
