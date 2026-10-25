import { LocaleSelect } from "../i18n/ui";
import { useAppTranslation } from "../i18n/react";
import { ThemeToggle } from "./ThemeToggle";
export function ConfigError({ message }: { message: unknown }) {
  const { t, message: displayMessage } = useAppTranslation();
  return (
    <main className="grid min-h-dvh place-items-center bg-base-300 p-6 font-sans text-base-content">
      <section className="alert alert-error max-w-xl" role="alert">
        <div>
          <h1 className="text-lg font-bold">{t("errors.configHeading")}</h1>
          <p>{displayMessage(message)}</p>
          <div className="flex flex-wrap items-center gap-3">
            <LocaleSelect />
            <ThemeToggle />
          </div>
          <p>{t("errors.configHelp")}</p>
        </div>
      </section>
    </main>
  );
}
