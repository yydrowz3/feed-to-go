import { redirect } from "@tanstack/react-router";
import type { AppRuntime } from "./runtime.ts";
import { safeRedirect } from "./navigation.ts";
export function requireAuth({
  context,
  location,
}: {
  context: AppRuntime;
  location: { href: string };
}) {
  if (!context.authStore.getState().accessToken) {
    throw redirect({
      to: "/account",
      search: { redirect: safeRedirect(location.href) },
      replace: true,
    });
  }
}
