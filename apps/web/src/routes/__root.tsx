import { createRootRouteWithContext } from "@tanstack/react-router";
import type { AppRuntime } from "../lib/runtime";
import { RootLayout, RouteError, NotFoundPage } from "../components/RootLayout";
import { LoadingState } from "../components/LoadingState";
import { validateSearch } from "../lib/navigation";
export const Route = createRootRouteWithContext<AppRuntime>()({
  validateSearch,
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: NotFoundPage,
  pendingComponent: LoadingState,
});
