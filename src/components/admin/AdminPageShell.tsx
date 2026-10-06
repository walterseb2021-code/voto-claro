import type { ReactNode } from "react";

export default function AdminPageShell({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <main className="min-h-screen bg-[#2f61a6] p-4 font-sans text-base text-black sm:p-6 lg:p-8">
      <div className={`mx-auto min-h-[calc(100vh-2rem)] w-full max-w-6xl rounded-[22px] bg-[#00ffff] p-4 sm:min-h-[calc(100vh-3rem)] sm:p-6 lg:min-h-[calc(100vh-4rem)] ${centered ? "flex items-center justify-center" : "space-y-6"}`}>
        {children}
      </div>
    </main>
  );
}
