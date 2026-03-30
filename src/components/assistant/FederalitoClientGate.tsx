"use client";

import HideOnPitch from "@/components/HideOnPitch";
import FederalitoClientRoot from "@/components/assistant/FederalitoClientRoot";

export default function FederalitoClientGate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FederalitoClientRoot>
      {children}
      <HideOnPitch>
        <></>
      </HideOnPitch>
    </FederalitoClientRoot>
  );
}