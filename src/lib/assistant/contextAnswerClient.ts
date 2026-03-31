import {
  getPageIdFromPathname,
  isContextualAssistantPage,
  normalizePageId,
} from "@/lib/assistant/pageProfiles";
import { sanitizeAssistantTextForUi } from "@/lib/assistant/sanitizeAssistantText";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function detectContextualPageId(
  pathname?: string | null,
  pageContext?: unknown
): string | null {
  if (isRecord(pageContext) && typeof pageContext.pageId === "string") {
    return normalizePageId(pageContext.pageId);
  }

  return getPageIdFromPathname(pathname);
}

export function shouldUseContextEndpoint(
  pathname?: string | null,
  pageContext?: unknown
): boolean {
  const pageId = detectContextualPageId(pathname, pageContext);
  return Boolean(pageId && isContextualAssistantPage(pageId) && pageContext);
}

export async function requestContextualAnswer(args: {
  question: string;
  pathname?: string | null;
  pageContext?: unknown;
}): Promise<string | null> {
  const question = String(args.question ?? "").trim();

  if (!question) return null;
  if (!shouldUseContextEndpoint(args.pathname, args.pageContext)) return null;

  const response = await fetch("/api/assistant/context-answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      pathname: args.pathname ?? "",
      pageContext: args.pageContext ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(`context-answer failed: ${response.status}`);
  }

  const data = await response.json();
  const answer = sanitizeAssistantTextForUi(String(data?.answer ?? "").trim());

  return answer || null;
}