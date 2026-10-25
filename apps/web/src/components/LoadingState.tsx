import { useAppTranslation } from "../i18n/react";
export function LoadingState({ label = "common.loading" }: { label?: string }) {
  const { t } = useAppTranslation();
  return (
    <div role="status" className="flex min-h-40 items-center justify-center gap-3">
      <span className="loading loading-spinner text-primary" />
      {label === "common.loading" ? t("common.loading") : label}
    </div>
  );
}
