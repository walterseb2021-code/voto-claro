"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type AssistantPageContext = {
  pageId: string;
  pageTitle: string;
  route: string;

  summary?: string;
  activeSection?: string;

  visibleText?: string;
  availableActions?: string[];

  selectedItemId?: string;
  selectedItemTitle?: string;

  status?: "idle" | "loading" | "ready" | "error";

  dynamicData?: Record<string, unknown>;
  updatedAt: number;
};

type AssistantRuntimeValue = {
  pageContext: AssistantPageContext | null;
  setPageContext: (next: Omit<AssistantPageContext, "updatedAt">) => void;
  clearPageContext: () => void;
};

const AssistantRuntimeContext = createContext<AssistantRuntimeValue | null>(null);

export function AssistantRuntimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pageContext, setPageContextState] = useState<AssistantPageContext | null>(null);

  const setPageContext = useCallback((next: Omit<AssistantPageContext, "updatedAt">) => {
    setPageContextState({
      ...next,
      updatedAt: Date.now(),
    });
  }, []);

  const clearPageContext = useCallback(() => {
    setPageContextState(null);
  }, []);

  const value = useMemo(
    () => ({
      pageContext,
      setPageContext,
      clearPageContext,
    }),
    [pageContext, setPageContext, clearPageContext]
  );

  return (
    <AssistantRuntimeContext.Provider value={value}>
      {children}
    </AssistantRuntimeContext.Provider>
  );
}

export function useAssistantRuntime() {
  const ctx = useContext(AssistantRuntimeContext);

  if (!ctx) {
    throw new Error("useAssistantRuntime debe usarse dentro de AssistantRuntimeProvider");
  }

  return ctx;
}