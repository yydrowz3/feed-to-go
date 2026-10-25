import { useAppTranslation } from "../i18n/react";
import { Link, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AppShell } from "./AppShell";
import { ErrorState } from "./ErrorState";
import { useTheme } from "../lib/theme";
export function RootLayout() {
  const { t } = useAppTranslation();
  const { theme } = useTheme();
  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-base-100 focus:p-3"
        href="#main-content"
      >
        {t("navigation.skipContent")}
      </a>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster theme={theme} richColors />
    </>
  );
}
export function RouteError({ error, reset }: ErrorComponentProps) {
  return <ErrorState message={error} retry={reset} />;
}
export function NotFoundPage() {
  const { t } = useAppTranslation();
  return (
    <section className="grid min-h-48 place-content-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t("navigation.notFound")}</h1>
      <Link to="/" className="btn btn-primary">
        {t("navigation.backHome")}
      </Link>
    </section>
  );
}
