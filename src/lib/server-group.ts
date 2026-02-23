// src/lib/server-group.ts
import { cookies } from "next/headers";

export async function getServerGroup(): Promise<string> {
  const cookieStore = await cookies();
  const group = cookieStore.get("vc_group")?.value;

  if (!group) {
    throw new Error("vc_group cookie not found");
  }

  return group;
}