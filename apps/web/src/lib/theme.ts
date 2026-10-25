import { useStore } from "zustand";
import { createThemeStore } from "../stores/theme";

let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  /* Storage may be disabled. */
}

// The head script resolves the preference before the first paint.
const themeStore = createThemeStore(
  document.documentElement.dataset.theme === "night" ? "dark" : "light",
  {
    storage,
    apply(theme) {
      document.documentElement.dataset.theme = theme === "dark" ? "night" : "light";
      document.documentElement.style.colorScheme = theme;
    },
  },
);

export function useTheme() {
  return useStore(themeStore);
}
