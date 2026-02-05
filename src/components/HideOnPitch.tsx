"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function HideOnPitch({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/pitch") return null;
  return <>{children}</>;
}
