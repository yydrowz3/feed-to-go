import { AppError } from "../i18n/app-error.ts";
function hasUnsafeCharacters(value: string): boolean {
  return Array.from(value).some(
    (char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
}
export function safeRedirect(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    hasUnsafeCharacters(value)
  )
    return undefined;
  try {
    let decoded = value;
    for (let i = 0; i < 4; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (!decoded.startsWith("/") || decoded.startsWith("//") || hasUnsafeCharacters(decoded))
      return undefined;
    const url = new URL(decoded, "https://app.invalid");
    if (
      url.origin !== "https://app.invalid" ||
      url.pathname.replace(/\/+$/, "").toLowerCase() === "/account"
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}
export function parseResourceId(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new AppError("validation.resourceId");
  return Number(value);
}
export function validateSearch(search: Record<string, unknown>): { q?: string } {
  return { q: typeof search.q === "string" ? search.q : "" };
}
export function validateAccountSearch(search: Record<string, unknown>): { redirect?: string } {
  return { redirect: safeRedirect(search.redirect) };
}
