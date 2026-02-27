// src/brands/useBrand.ts
"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { getBrand, BrandTheme } from "./brands";

export function useBrand(): BrandTheme {
  const sp = useSearchParams();
  const brandParam = sp.get("brand");
  return useMemo(() => getBrand(brandParam), [brandParam]);
}