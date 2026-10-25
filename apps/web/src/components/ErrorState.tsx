import { useAppTranslation } from "../i18n/react";
import { Link } from "@tanstack/react-router";
import type { MessageKey } from "../i18n/app-error";
export function ErrorState({
  message = "errors.pageFailed",
  retry,
  fallback = "errors.pageFailed",
}: {
  message?: unknown;
  retry?: () => void;
  fallback?: MessageKey;
}) {
  const { t, message: displayMessage } = useAppTranslation();
  return (
    <section
      role="alert"
      className="m-auto flex max-w-xl flex-col items-center gap-4 p-6 text-center"
    >
      <h1 className="text-xl font-bold">{t("errors.heading")}</h1>
      <p className="break-words">
        {typeof message === "string"
          ? message.startsWith("errors.") || message.startsWith("account.")
            ? displayMessage(message, fallback)
            : message
          : displayMessage(message, fallback)}
      </p>
      <div className="flex gap-3">
        {retry && (
          <button type="button" className="btn btn-primary" onClick={retry}>
            {t("common.retry")}
          </button>
        )}
        <Link to="/" className="btn btn-ghost">
          {t("navigation.backHome")}
        </Link>
      </div>
    </section>
  );
}
