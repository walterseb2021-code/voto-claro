// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FederalitoClientGate from "@/components/assistant/FederalitoClientGate";
import HideOnPitch from "@/components/HideOnPitch";
import PartyThemeInitializer from "@/components/PartyThemeInitializer";
import AppSurfaceWrapper from "@/components/AppSurfaceWrapper";
import BodyPathSetter from "@/components/BodyPathSetter";

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
  manifest: "/manifest.json", // ← ÚNICA LÍNEA AGREGADA
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
        {/* ✅ METADATOS PARA PWA (agregados sin romper nada) */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0537A8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="VotoClaro" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>

      <body
        className={[
          geistSans.variable,
          geistMono.variable,
          "antialiased",
          "min-h-screen",
        ].join(" ")}
      >
        {/* ✅ Activa theme global leyendo localStorage y seteando data-party en <html> */}
        <BodyPathSetter />
        <PartyThemeInitializer />

        {/* ✅ Federalito (pero NO en /pitch) */}
        <HideOnPitch>
          <FederalitoClientGate />
        </HideOnPitch>

        {/* ✅ Frame/surface global SOLO para APP, excluye /pitch y /admin */}
        <AppSurfaceWrapper>{children}</AppSurfaceWrapper>
      </body>
    </html>
  );
}