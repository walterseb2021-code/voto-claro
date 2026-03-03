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
        id: "cesar-acuña-peralta",
        name: "César Acuña Peralta",
        cargo: "Presidente",
        dni: undefined,
        photo: "/candidates/cesar-acuña-peralta.png",
        region: "PERÚ",
        profileLink:
  "https://www.youtube.com/watch?v=CbZxEWz-4z0",

      },
      {
        id: "jessica-milagros-tumi-rivas",
        name: "Jessica Milagros Tumi Rivas",
        cargo: "Primer Vicepresidente",
        dni: undefined,
        photo: "/candidates/jessica-milagros-tumi-rivas.png",
        region: "PERÚ",
         profileLink:
  "https://www.youtube.com/watch?v=urU6JaSn-9Y",
      },
       {
        id: "alejandro-soto-reyes",
        name: "Alejandro Soto Reyes",
        cargo: "Segunda Vicepresidente",
        dni: undefined,
        photo: "/candidates/alejandro-soto-reyes.png",
        region: "PERÚ",
         profileLink:
  "https://www.youtube.com/watch?v=vmBhhO9yLWk",
      },
    ],
  },
  {
    category: "PARLAMENTO_ANDINO",
    candidates: [
      {
        id: "claudia-vanesa-fuentes-lozano",
        name: "Claudia Vanesa Fuentes Lozano",
        cargo: "Parlamentario Andino",
        dni: undefined,
        photo: "/candidates/claudia-vanesa-fuentes-lozano.png",
        region: "PERÚ",
         profileLink:
  "https://www.youtube.com/watch?v=JkJ4l5i40J0",
      },
      {
        id: "jorge-alejandro-gonzales-ore",
        name: "Jorge Alejandro Gonzales Ore",
        cargo: "Parlamentario Andino",
        dni: undefined,
        photo: "/candidates/jorge-alejandro-gonzales-ore.png",
        region: "PERÚ",
         profileLink:
  "https://www.youtube.com/shorts/cX1cvt5zn6U",
      },
    ],
  },
  {
    category: "DIPUTADOS",
    candidates: [
      {
        id: "elia-juana-obregon-rodriguez",
        name: "Elia Juana Obregón Rodríguez",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/elia-juana-obregon-rodriguez.png",
        region: "LIMA",
         profileLink:
      "https://www.youtube.com/shorts/w2ycFYj1Vmc",
      },
      {
        id: "jaqueline-yessenia-lozano-millones",
        name: "Jaqueline Yessenia Lozano Millones",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/jaqueline-yessenia-lozano-millones.png",
        region: "LIMA",
         profileLink:
  "https://www.youtube.com/shorts/w2ycFYj1Vmc",
      },
      {
        id: "rocio-del-pilar-santana-santivañez",
        name: "Rocío Del Pilar Santana Santivañez",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/rocio-del-pilar-santana-santivañez.png",
        region: "LA LIBERTAD",
         profileLink:
      "https://www.youtube.com/shorts/w2ycFYj1Vmc",
      },
      {
        id: "veronica-rebeca-escobel-ordoñez",
        name: "Verónica Rebeca Escobel Ordóñez",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/veronica-rebeca-escobel-ordoñez.png",
        region: "LA LIBERTAD",
         profileLink:
      "https://www.youtube.com/shorts/w2ycFYj1Vmc",
      },
      {
        id: "zulema-rebeca-azucena-barrenechea-reyes",
        name: "Zulema Rebeca Azucena Barrenechea Reyes",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/zulema-rebeca-azucena-barrenechea-reyes.png",
        region: "ÁNCASH",
         profileLink:
      "https://www.youtube.com/shorts/ndw9UgWb2Hg",
      },
      {
        id: "alejandro-manuel-diaz-trujillo",
        name: "Alejandro Manuel Díaz Trujillo",
        cargo: "Diputado",
        dni: undefined,
        photo: "/candidates/alejandro-manuel-diaz-trujillo.png",
        region: "ÁNCASH",
         profileLink:
      "https://www.youtube.com/shorts/w2ycFYj1Vmc",
      },
    ],
  },
  {
    category: "SENADORES_DISTRITO_UNICO",
    candidates: [
      {
        id: "cesar-acuña-peralta",
        name: "César Acuña Peralta",
        cargo: "Senador Distrito Único",
        dni: undefined,
        photo: "/candidates/cesar-acuña-peralta.png",
        region: "PERÚ",
        profileLink:
  "https://www.youtube.com/shorts/cveRAh7fNEs",
      },
      {
        id: "rosa-maria-gonzales-cordero",
        name: "Rosa María Gonzales Cordero",
        cargo: "Senador Distrito Único",
        dni: undefined,
        photo: "/candidates/rosa-maria-gonzales-cordero.png",
        region: "PERÚ",
         profileLink:
  "https://www.youtube.com/shorts/cveRAh7fNEs",
    },
    ],
  },
  {
    category: "SENADORES_DISTRITO_MULTIPLE",
    candidates: [
      {
        id: "cesar-augusto-sanchez-ulloa",
        name: "César Augusto Sánchez Ulloa",
        cargo: "Senador Distrito Múltiple",
        dni: undefined,
        photo: "/candidates/cesar-augusto-sanchez-ulloa.png",
        region: "ÁNCASH",
         profileLink:
  "https://www.youtube.com/watch?v=hoY3wtKhMx4",
      },
      {
        id: "rosa-maria-gonzales-cordero",
        name: "Rosa María Gonzales Cordero",
        cargo: "Senador Distrito Múltiple",
        dni: undefined,
        photo: "/candidates/rosa-maria-gonzales-cordero.png",
        region: "ÁNCASH",
         profileLink:
  "https://www.youtube.com/shorts/InWlx1UVj7I",
      },
    ],
  },
];
