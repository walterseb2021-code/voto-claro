"use client";

import { usePathname } from "next/navigation";
import FederalitoClientRoot from "@/components/assistant/FederalitoClientRoot";

export default function FederalitoClientGate() {
  const pathname = usePathname();

  // ✅ En /pitch NO cargamos Federalito para que no interfiera con la bienvenida
  if (pathname === "/pitch") return null;

  return <FederalitoClientRoot />;
}
