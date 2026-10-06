import type { ReactNode } from "react";
export default function AdminHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex min-w-0 flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between"><div className="min-w-0 flex-1 break-words md:basis-64"><h1 className="text-3xl font-extrabold tracking-tight text-black md:text-4xl">{title}</h1>{description && <p className="mt-2 text-base text-slate-800">{description}</p>}</div>{actions}</header>;
}
