// src/lib/votoclaro/mockCandidates.ts
export type CandidateRole = "PRESIDENTE" | "VICE1" | "VICE2";

export type MockCandidate = {
  id: string;
  full_name: string;
  party_name: string;
  role: CandidateRole;
};

// ✅ Tu lista controlada (por ahora: presidentes)
// Luego podrás añadir vice1/vice2 con el mismo formato.
export const MOCK_CANDIDATES: MockCandidate[] = [
  { id: "alex-gonzales-castillo", full_name: "Alex Gonzales Castillo", party_name: "Partido Demócrata Verde", role: "PRESIDENTE" },
  { id: "alfonso-carlos-espa-y-garces-alvear", full_name: "Alfonso Carlos Espa y Garcés-Alvear", party_name: "Partido Sí Creo", role: "PRESIDENTE" },
  { id: "alvaro-gonzalo-paz-de-la-barra-freigeiro", full_name: "Álvaro Gonzalo Paz de la Barra Freigeiro", party_name: "Fe en el Perú", role: "PRESIDENTE" },
  { id: "antonio-ortiz-villano", full_name: "Antonio Ortiz Villano", party_name: "Salvemos al Perú", role: "PRESIDENTE" },
  { id: "armando-joaquin-masse-fernandez", full_name: "Armando Joaquín Massé Fernández", party_name: "Partido Democrático Federal", role: "PRESIDENTE" },

  { id: "cesar-acuña-peralta", full_name: "César Acuña Peralta", party_name: "Alianza para el Progreso", role: "PRESIDENTE" },
  { id: "charlie-carrasco-salazar", full_name: "Charlie Carrasco Salazar", party_name: "Partido Demócrata Único Perú", role: "PRESIDENTE" },

  { id: "carlos-ernesto-jaico-carranza", full_name: "Carlos Ernesto Jaico Carranza", party_name: "Perú Moderno", role: "PRESIDENTE" },
  { id: "carlos-gonsalo-alvarez-loayza", full_name: "Carlos Gonsalo Álvarez Loayza", party_name: "País para Todos", role: "PRESIDENTE" },

  { id: "fiorella-giannina-molinelli-aristondo", full_name: "Fiorella Giannina Molinelli Aristondo", party_name: "Fuerza y Libertad", role: "PRESIDENTE" },
  { id: "francisco-ernesto-diez-canseco-tavara", full_name: "Francisco Ernesto Diez-Canseco Távara", party_name: "Perú Acción", role: "PRESIDENTE" },

  { id: "george-patrick-forsyth-sommer", full_name: "George Patrick Forsyth Sommer", party_name: "Somos Perú", role: "PRESIDENTE" },
  { id: "herbert-caller-gutierrez", full_name: "Herbert Caller Gutiérrez", party_name: "Partido Patriótico del Perú", role: "PRESIDENTE" },
  { id: "jorge-nieto-montesinos", full_name: "Jorge Nieto Montesinos", party_name: "Partido del Buen Gobierno", role: "PRESIDENTE" },

  { id: "jose-daniel-williams-zapata", full_name: "José Daniel Williams Zapata", party_name: "Avanza País", role: "PRESIDENTE" },
  { id: "jose-leon-luna-galvez", full_name: "José León Luna Gálvez", party_name: "Podemos Perú", role: "PRESIDENTE" },
  { id: "keiko-sofia-fujimori-higuchi", full_name: "Keiko Sofía Fujimori Higuchi", party_name: "Fuerza Popular", role: "PRESIDENTE" },
  { id: "luis-fernando-olivera-vega", full_name: "Luis Fernando Olivera Vega", party_name: "Partido Frente de la Esperanza 2021", role: "PRESIDENTE" },

  { id: "maria-soledad-perez-tello-de-rodriguez", full_name: "María Soledad Pérez Tello de Rodríguez", party_name: "Primero la Gente", role: "PRESIDENTE" },
  { id: "mario-enrique-vizcarra-cornejo", full_name: "Mario Enrique Vizcarra Cornejo", party_name: "Perú Primero", role: "PRESIDENTE" },
  { id: "mesias-antonio-guevara-amasifuen", full_name: "Mesías Antonio Guevara Amasifuen", party_name: "Partido Morado", role: "PRESIDENTE" },
  { id: "napoleon-becerra-garcia", full_name: "Napoleón Becerra García", party_name: "Partido de los Trabajadores y Emprendedores", role: "PRESIDENTE" },
  { id: "pablo-alfonso-lopez-chau-nava", full_name: "Pablo Alfonso López Chau Nava", party_name: "Ahora Nación", role: "PRESIDENTE" },
  { id: "paul-davis-jaimes-blanco", full_name: "Paul Davis Jaimes Blanco", party_name: "Progresemos", role: "PRESIDENTE" },
  { id: "pitter-enrique-valderrama-peña", full_name: "Pitter Enrique Valderrama Peña", party_name: "APRA", role: "PRESIDENTE" },

  { id: "rafael-bernardo-lopez-aliaga-cazorla", full_name: "Rafael Bernardo López Aliaga Cazorla", party_name: "Renovación Popular", role: "PRESIDENTE" },
  { id: "rafael-jorge-belaunde-llosa", full_name: "Rafael Jorge Belaúnde Llosa", party_name: "Libertad Popular", role: "PRESIDENTE" },
  { id: "ricardo-pablo-belmont-cassinelli", full_name: "Ricardo Pablo Belmont Cassinelli", party_name: "Partido Cívico Obras", role: "PRESIDENTE" },
  { id: "roberto-enrique-chiabra-leon", full_name: "Roberto Enrique Chiabra León", party_name: "Unidad Nacional", role: "PRESIDENTE" },
  { id: "roberto-helbert-sanchez-palomino", full_name: "Roberto Helbert Sánchez Palomino", party_name: "Juntos por el Perú", role: "PRESIDENTE" },
  { id: "ronald-darwin-atencio-sotomayor", full_name: "Ronald Darwin Atencio Sotomayor", party_name: "Alianza Electoral Venceremos", role: "PRESIDENTE" },
  { id: "rosario-del-pilar-fernandez-bazan", full_name: "Rosario del Pilar Fernández Bazán", party_name: "Un Camino Diferente", role: "PRESIDENTE" },
  { id: "vladimir-roy-cerron-rojas", full_name: "Vladimir Roy Cerrón Rojas", party_name: "Perú Libre", role: "PRESIDENTE" },
  { id: "walter-gilmer-chirinos-purizaga", full_name: "Walter Gilmer Chirinos Purizaga", party_name: "PRIN", role: "PRESIDENTE" },
  { id: "wolfgang-mario-grozo-costa", full_name: "Wolfgang Mario Grozo Costa", party_name: "Integridad Democrática", role: "PRESIDENTE" },
  { id: "yonhy-lescano-ancieta", full_name: "Yonhy Lescano Ancieta", party_name: "Cooperación Popular", role: "PRESIDENTE" },
];
