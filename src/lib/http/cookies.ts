export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  const found = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));

  if (!found) return null;

  const value = found.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}