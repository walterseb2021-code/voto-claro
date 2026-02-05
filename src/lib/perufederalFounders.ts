export type Founder = {
  id: string;
  name: string;
  quote: string;
  photo: string;
};

export const FOUNDERS: Founder[] = [
  {
    id: "virgilio-acuña-peralta",
    name: "Viegilio Acuña Peralta",
    quote: "Un país no se fortalece cuando todo de decide en un solo lugar; si no,cuando cada región puede hacerse responsable de su propio destino.",
    // Usamos una imagen que ya existe en tu proyecto para no romper nada.
    photo: "/candidates/virgilio-acuña-peralta.png"
  },
  {
    id: "lydia-lourdes-diaz-pablo",
    name: "Lydia Lourdes Diaz Pablo",
    quote: "Construir un Perú donde el poder esté más cerca de la gente y el estado vuelva a cumplir su función, es hacer que las decisiones se tomen desde las regiones y no solo desde el centro.",
    photo: "/candidates/lydia-lourdes-diaz-pablo.png"
    
  },
  {
    id: "armando-joaquin-masse-fernandez",
    name: "Armando Joaquín Massé Fernandez",
    quote: "El Perú es un país que sangra en silencio cuando la vida no se protege, que se adormece cuando la creación se detiene, que se quiebra cuando las voces son ignoradas y que se extravía cuando el poder olvida a quién debe servir. Por eso, sanar, trabajar, expresar y gobernar no son senderos distintos, sino un mismo acto de responsabilidad y amor hacia la gente, porque un país solo florece cuando su pueblo es escuchado, cuidado y dignificado.",
    photo: "/candidates/armando-joaquin-masse-fernandez.png"
    
  },
];
