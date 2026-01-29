"use client";

import React from "react";

type Props = {
  kind: "WITH_EVIDENCE" | "NO_EVIDENCE" | "GUIDE";
  page?: number;              // ✅ NUEVO: página opcional
  size?: "sm" | "md";
  className?: string;
};

const styles = {
  base:
    "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold select-none",
  sm: "text-[11px] leading-4",
  md: "text-xs",
  with: "bg-emerald-50 text-emerald-800 border-emerald-200",
  no: "bg-amber-50 text-amber-900 border-amber-200",
  guide: "bg-slate-50 text-slate-700 border-slate-200",
};

export default function EvidenceBadge({
  kind,
  page,
  size = "md",
  className = "",
}: Props) {
  let label = "";
  let cls = "";

  if (kind === "WITH_EVIDENCE") {
    label = "Con evidencia";
    cls = styles.with;
  } else if (kind === "NO_EVIDENCE") {
    label = "Sin evidencia";
    cls = styles.no;
  } else {
    label = "Modo guía";
    cls = styles.guide;
  }

  const pageSuffix =
    kind === "WITH_EVIDENCE" && typeof page === "number" ? ` (p. ${page})` : "";

  return (
    <span className={`${styles.base} ${styles[size]} ${cls} ${className}`}>
      {kind === "WITH_EVIDENCE" ? "✅" : kind === "NO_EVIDENCE" ? "⚠️" : "🧭"}
      {label}
      {pageSuffix}
    </span>
  );
}
