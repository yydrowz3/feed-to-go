import { ApiError } from "../api/client.ts";
import { errorCodes } from "../api/error-codes.gen.ts";
import { AppError, type Message, type MessageKey } from "./app-error.ts";
import en from "./en.ts";
import { NetworkError } from "../api/network-error.ts";
export function isMessageKey(value: unknown): value is MessageKey {
  if (typeof value !== "string") return false;
  const dot = value.indexOf("."),
    ns = value.slice(0, dot);
  return (
    dot > 0 &&
    Object.hasOwn(en, ns) &&
    (Object.hasOwn(en[ns as keyof typeof en], value.slice(dot + 1)) ||
      Object.hasOwn(en[ns as keyof typeof en], value.slice(dot + 1) + "_other"))
  );
}
export function errorMessage(
  error: unknown,
  fallbackKey: MessageKey = "errors.actionFailed",
): Message {
  if (error instanceof AppError) return { key: error.key, params: error.params };
  if (isMessageKey(error)) return { key: error };
  if (error && typeof error === "object" && "key" in error && isMessageKey(error.key))
    return error as Message;
  if (error instanceof ApiError) {
    if (errorCodes.some((code) => code === error.code))
      return { key: `errors.api.${error.code}` as MessageKey };
    const fallback = {
      400: "VALIDATION_FAILED",
      401: "AUTH_REQUIRED",
      403: "FORBIDDEN",
      404: fallbackKey,
      409: fallbackKey,
      413: "FILE_TOO_LARGE",
      429: "RATE_LIMITED",
      503: "UPLOAD_SERVICE_UNAVAILABLE",
    }[error.status];
    return {
      key: (fallback
        ? errorCodes.some((code) => code === fallback)
          ? `errors.api.${fallback}`
          : fallback
        : error.status >= 500
          ? "errors.api.INTERNAL_ERROR"
          : fallbackKey) as MessageKey,
    };
  }
  if (error instanceof NetworkError) return { key: "errors.network" };
  return { key: fallbackKey };
}
