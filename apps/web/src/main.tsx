import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRuntime } from "./lib/runtime";
import { ConfigError } from "./components/ConfigError";
import "./index.css";
import { I18nextProvider } from "react-i18next";
import { createAppI18n, restoreLocale } from "./i18n/core";
let localeStorage: Storage | undefined;
try {
  localeStorage = window.localStorage;
} catch {
  /* Storage may be disabled. */
}
const i18n = createAppI18n(restoreLocale(localeStorage));
document.documentElement.lang = i18n.language;
i18n.on("languageChanged", (locale) => {
  document.documentElement.lang = locale;
});

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
function createApplication(value: unknown) {
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    /* Storage may be disabled. */
  }
  const runtime = createRuntime(value, { storage });
  const router = createRouter({ routeTree, context: runtime, trailingSlash: "never" });
  runtime.setRouterInvalidation(() => {
    void router.invalidate();
  });
  return { runtime, router };
}

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createApplication>["router"];
  }
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById("root")!);
try {
  const { runtime, router } = createApplication(import.meta.env.VITE_API_BASE);
  if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose());
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={runtime.queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>,
  );
} catch (error) {
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ConfigError message={error} />
      </I18nextProvider>
    </StrictMode>,
  );
}
