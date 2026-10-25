import { createStore } from "zustand/vanilla";

export type Theme = "light" | "dark";
export const themeKey = "feed-to-go.theme";

export function createThemeStore(
  initialTheme: Theme,
  options: {
    storage?: Pick<Storage, "setItem">;
    apply?: (theme: Theme) => void;
  } = {},
) {
  options.apply?.(initialTheme);
  return createStore<{
    theme: Theme;
    toggleTheme: () => void;
  }>()((set, get) => ({
    theme: initialTheme,
    toggleTheme() {
      const theme = get().theme === "dark" ? "light" : "dark";
      options.apply?.(theme);
      set({ theme });
      try {
        options.storage?.setItem(themeKey, theme);
      } catch {
        /* The current page can still switch themes without storage. */
      }
    },
  }));
}
