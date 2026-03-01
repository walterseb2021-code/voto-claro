"use client";

import { useEffect } from "react";
import { PARTY_STORAGE_KEY, DEFAULT_PARTY } from "@/config/partyThemes";

export default function PartyThemeInitializer() {
  useEffect(() => {
    const party = localStorage.getItem(PARTY_STORAGE_KEY) || DEFAULT_PARTY;
    document.documentElement.setAttribute("data-party", party);
  }, []);

  return null;
}