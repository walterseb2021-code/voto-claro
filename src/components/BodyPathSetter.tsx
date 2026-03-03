"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function BodyPathSetter() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.setAttribute("data-path", pathname || "");
  }, [pathname]);

  return null;
}