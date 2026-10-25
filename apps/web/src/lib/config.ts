import { AppError } from "../i18n/app-error.ts";
export function parseApiBase(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError("errors.configRequired");
  const input = value.trim();
  if (!/^https?:\/\//i.test(input) || input.includes("\\"))
    throw new AppError("errors.configAbsolute");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("errors.configAbsolute");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    input.includes("?") ||
    input.includes("#")
  ) {
    throw new AppError("errors.configParts");
  }
  return url.href.replace(/\/+$/, "");
}

export function apiUrl(baseUrl: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\?#]/.test(path))
    throw new AppError("errors.apiPath");
  return `${baseUrl}${path}`;
}
