import { useAppTranslation } from "../i18n/react";
import type { ReactNode } from "react";
export function FormField({
  id,
  label,
  errors = [],
  children,
}: {
  id: string;
  label: string;
  errors?: unknown[];
  children: ReactNode;
}) {
  const { message } = useAppTranslation();
  const messages = errors
    .map((error) =>
      typeof error === "string"
        ? message(error)
        : error && typeof error === "object" && "message" in error
          ? message(error.message)
          : "",
    )
    .filter(Boolean);
  return (
    <div className="grid gap-2">
      <label className="label text-base-content" htmlFor={id}>
        {label}
      </label>
      {children}
      {messages.length > 0 && (
        <p id={id + "-error"} className="text-sm text-error" role="alert">
          {messages.join(" · ")}
        </p>
      )}
    </div>
  );
}
