// src/app/cambio/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";

export default function CambioPage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  const token = String(searchParams?.t ?? "").trim();

  if (token.startsWith("GRUPOB-")) {
    redirect(`/cambio-app?t=${encodeURIComponent(token)}`);
  }

  // Default: GRUPOA u otros
  redirect(`/cambio-con-valentia?t=${encodeURIComponent(token)}`);
}