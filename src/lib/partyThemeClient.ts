// src/lib/partyThemeClient.ts
"use client";

export type PartyId = "perufederal" | "app";

const LS_KEY = "votoclaro_party_active_v1";
const EVT_NAME = "votoclaro:party";

export function setActiveParty(partyId: PartyId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, partyId);
  } catch {}
  window.dispatchEvent(new CustomEvent(EVT_NAME, { detail: { partyId } }));
}

export function getActiveParty(): PartyId {
  if (typeof window === "undefined") return "perufederal";
  try {
    const v = String(window.localStorage.getItem(LS_KEY) || "").trim();
    if (v === "app" || v === "perufederal") return v;
    return "perufederal";
  } catch {
    return "perufederal";
  }
}

export function onPartyChange(cb: (partyId: PartyId) => void) {
  if (typeof window === "undefined") return () => {};

  const onEvt = (e: any) => {
    const p = e?.detail?.partyId;
    if (p === "app" || p === "perufederal") cb(p);
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key !== LS_KEY) return;
    const p = String(e.newValue || "").trim();
    if (p === "app" || p === "perufederal") cb(p as PartyId);
  };

  window.addEventListener(EVT_NAME, onEvt as any);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(EVT_NAME, onEvt as any);
    window.removeEventListener("storage", onStorage);
  };
}

export function partyWelcomeAssets(partyId: PartyId) {
  if (partyId === "app") {
    return {
      partyId,
      avatarSrc: "/app-avatar.png",
      welcomeVideoSrc: "/media/app-bienvenida.mp4",
    };
  }

  // Default: Perú Federal
  return {
    partyId,
    avatarSrc: "/federalito.png",
    welcomeVideoSrc: "/media/federalito.mp4",
  };
}