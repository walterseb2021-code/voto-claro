"use client";

import { useState, type ReactNode } from "react";
import AdminButton from "./AdminButton";

export default function AdminNavActions({ children, includeLogout = false }: { children: ReactNode; includeLogout?: boolean }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function onLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setLogoutError("No se pudo cerrar la sesion.");
        return;
      }
      window.location.href = "/admin/login";
    } catch {
      setLogoutError("No se pudo cerrar la sesion.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <nav aria-label="Navegación administrativa" className="flex flex-wrap items-center gap-2">
        {children}
        {includeLogout && <AdminButton type="button" onClick={onLogout} disabled={loggingOut}>Cerrar sesión</AdminButton>}
      </nav>
      {includeLogout && logoutError && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{logoutError}</p>}
    </div>
  );
}
