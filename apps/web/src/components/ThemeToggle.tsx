import { Moon, Sun } from "lucide-react";
import { useAppTranslation } from "../i18n/react";
import { useTheme } from "../lib/theme";

export function ThemeToggle() {
  const { t } = useAppTranslation();
  const { theme, toggleTheme } = useTheme();
  const label = t(theme === "dark" ? "common.switchToLight" : "common.switchToDark");
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-square btn-sm shrink-0"
      data-testid="theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
