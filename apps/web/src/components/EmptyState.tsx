import { useAppTranslation } from "../i18n/react";
import type { ReactNode } from "react";
export function EmptyState({
  title = "common.empty",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  const { t } = useAppTranslation();
  return (
    <section className="grid min-h-48 content-center justify-items-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">
        {title === "common.empty" ? t("common.empty") : title}
      </h1>
      <div className="max-w-lg text-base-content/60">{children}</div>
    </section>
  );
}
