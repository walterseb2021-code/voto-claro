function normalizeBase(input: string): string {
  return String(input ?? "")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeAssistantTextForUi(input: string): string {
  return normalizeBase(input)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeAssistantTextForVoice(input: string): string {
  return normalizeBase(input)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•▪◦]+\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+[–—-]\s+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+,/g, ",")
    .trim();
}