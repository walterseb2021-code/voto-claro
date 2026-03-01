export type PartyKey = "app" | "perufederal";

export const PARTY_STORAGE_KEY = "votoclaro_active_party_v1";

export const partyThemes: Record<PartyKey, { label: string }> = {
  app: {
    label: "Alianza para el Progreso",
  },
  perufederal: {
    label: "Perú Federal",
  },
};

export const DEFAULT_PARTY: PartyKey = "perufederal";