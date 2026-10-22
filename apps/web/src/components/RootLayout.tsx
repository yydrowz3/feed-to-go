import { Link, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AppShell } from "./AppShell";
import { ErrorState } from "./ErrorState";
export function RootLayout() {
  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-base-100 focus:p-3"
        href="#main-content"
      >
        跳转到内容
      </a>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster theme="dark" richColors />
    </>
  );
}
export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <ErrorState message={error instanceof Error ? error.message : "页面加载失败"} retry={reset} />
  );
}
export function NotFoundPage() {
  return (
    <section className="grid min-h-48 place-content-center gap-4 text-center">
      <h1 className="text-2xl font-bold">页面不存在</h1>
      <Link to="/" className="btn btn-primary">
        返回首页
      </Link>
    </section>
  );
}
