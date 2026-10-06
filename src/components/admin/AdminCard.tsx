import type { HTMLAttributes } from "react";

export default function AdminCard({ className = "", elevated = false, ...props }: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return <div {...props} className={`rounded-2xl border-[3px] border-[#dc2626] bg-white p-4 ${elevated ? "shadow-sm" : ""} ${className}`} />;
}
