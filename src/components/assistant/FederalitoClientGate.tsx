"use client";

import FederalitoClientRoot from "@/components/assistant/FederalitoClientRoot";

export default function FederalitoClientGate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FederalitoClientRoot>{children}</FederalitoClientRoot>;
}