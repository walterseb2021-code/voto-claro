// src/brands/brands.ts
export type BrandId = "perufederal" | "app";

export type BrandTheme = {
  id: BrandId;
  label: string;

  // Assets (pon tus rutas reales en /public/brands/...)
  avatarUrl: string;
  logoUrl?: string;

  // Tailwind class tokens (sin romper layout)
  ui: {
    pageBg: string;       // fondo general (gradient)
    panelBg: string;      // paneles/cards
    panelBorder: string;  // borde/filo
    buttonPrimary: string;
    buttonSecondary: string;
    chipIdle?: string;
    chipActive?: string;
  };

  copy?: {
    welcomeTitle?: string;
    welcomeSubtitle?: string;

    cambioTitle?: string;
    cambioSubtitle?: string;
  };
};

export const BRANDS: Record<BrandId, BrandTheme> = {
  perufederal: {
    id: "perufederal",
    label: "Perú Democrático Federal",
    avatarUrl: "/brands/perufederal/avatar.png",
    logoUrl: "/brands/perufederal/logo.png",
    ui: {
      pageBg: "bg-gradient-to-b from-green-100 via-green-50 to-green-100",
      panelBg: "bg-white",
      panelBorder: "border-red-700",
      buttonPrimary:
        "border border-green-900 bg-green-800 text-white hover:bg-green-900",
      buttonSecondary:
        "border border-red-700 bg-white text-red-700 hover:bg-red-50",
      chipIdle: "border-red-300 bg-green-50/70 text-slate-800 hover:bg-green-100 hover:border-red-400",
      chipActive: "border-green-900 bg-gradient-to-r from-green-700 to-green-800 text-white shadow-md ring-1 ring-red-300/60",
    },
    copy: {
      welcomeTitle: "Voto Claro",
      welcomeSubtitle: "Infórmate, compara y participa.",
      cambioTitle: "Un cambio con valentía",
      cambioSubtitle: "Contenido enfocado en este partido.",
    },
  },

  app: {
    id: "app",
    label: "Alianza para el Progreso",
    avatarUrl: "/brands/app/avatar.png",
    logoUrl: "/brands/app/logo.png",
    ui: {
      pageBg: "bg-gradient-to-b from-sky-100 via-white to-sky-50",
      panelBg: "bg-white",
      panelBorder: "border-sky-700",
      buttonPrimary:
        "border border-sky-900 bg-sky-700 text-white hover:bg-sky-800",
      buttonSecondary:
        "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
      chipIdle: "border-sky-200 bg-sky-50 text-slate-800 hover:bg-sky-100 hover:border-sky-300",
      chipActive: "border-sky-900 bg-gradient-to-r from-sky-700 to-sky-800 text-white shadow-md ring-1 ring-sky-200",
    },
    copy: {
      welcomeTitle: "Voto Claro",
      welcomeSubtitle: "Infórmate, compara y participa.",
      cambioTitle: "Propuestas del partido",
      cambioSubtitle: "Contenido enfocado en este partido.",
    },
  },
};

export function getBrand(brandId?: string | null): BrandTheme {
  const id = (brandId || "").toLowerCase().trim();
  if (id === "app") return BRANDS.app;
  return BRANDS.perufederal; // default
}