// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FederalitoClientGate from "@/components/assistant/FederalitoClientGate";
import HideOnPitch from "@/components/HideOnPitch";
import PartyThemeInitializer from "@/components/PartyThemeInitializer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voto Claro",
  description: "Información verificable de candidatos: HV, plan y actuar político.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
      </head>

      <body
        className={[
          geistSans.variable,
          geistMono.variable,
          "antialiased",
          "min-h-screen",
          // ✅ Ahora el fondo también es por partido (APP vs Perú Federal)
          "bg-gradient-to-b",
          "from-primary-soft",
          "via-white",
          "to-backgroundparty",
          "text-slate-900",
        ].join(" ")}
      >
        {/* ✅ Activa el theme global leyendo localStorage y seteando data-party en <html> */}
        <PartyThemeInitializer />

        {/* ✅ Federalito (pero NO en /pitch) */}
        <HideOnPitch>
          <FederalitoClientGate />
        </HideOnPitch>

        {children}
      </body>
    </html>
  );
}