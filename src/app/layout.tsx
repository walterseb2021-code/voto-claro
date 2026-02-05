// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FederalitoClientGate from "@/components/assistant/FederalitoClientGate";
import HideOnPitch from "@/components/HideOnPitch";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VotoClaro",
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
          "bg-gradient-to-b",
          "from-green-50",
          "via-white",
          "to-green-100",
          "text-slate-900",
        ].join(" ")}
      >
        {/* ✅ Federalito (pero NO en /pitch) */}
        <HideOnPitch>
          <FederalitoClientGate />
        </HideOnPitch>

        {children}
      </body>
    </html>
  );
}
