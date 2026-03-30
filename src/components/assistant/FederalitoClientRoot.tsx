"use client";

import HideOnPitch from "@/components/HideOnPitch";
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
      <HideOnPitch>
        <FederalitoAssistantPanel />
      </HideOnPitch>
    </AssistantRuntimeProvider>
  );
}