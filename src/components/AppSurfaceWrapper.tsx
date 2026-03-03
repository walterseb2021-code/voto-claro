"use client";

import { usePathname } from "next/navigation";

export default function AppSurfaceWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // No tocar /pitch (gate) ni /admin (panel)
  if (pathname === "/pitch" || pathname.startsWith("/admin")) return <>{children}</>;

  // Marco azul externo + superficie interior cian (solo se activa visualmente en APP vía CSS)
  return (
    <div className="vc-app-frame">
      <div className="vc-app-surface">{children}</div>
    </div>
  );
}
