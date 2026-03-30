"use client";

import FederalitoAssistantPanel from "./FederalitoAssistantPanel";
import { AssistantRuntimeProvider } from "./AssistantRuntimeContext";

export default function FederalitoClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AssistantRuntimeProvider>
      {children}
      <FederalitoAssistantPanel />
    </AssistantRuntimeProvider>
  );
}