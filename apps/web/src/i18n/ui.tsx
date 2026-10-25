import { useTranslation } from "react-i18next";
import { changeLocale, isLocale, localeOptions } from "./core.ts";
import { useAppTranslation } from "./react.ts";
export function TranslatedMessage({ value }: { value: unknown }) {
  const { message } = useAppTranslation();
  return <>{message(value)}</>;
}
export function LocaleSelect() {
  const { i18n } = useTranslation();
  const { locale, t } = useAppTranslation();
  return (
    <select
      className="select select-sm w-auto max-w-full shrink-0"
      aria-label={t("common.language")}
      value={locale}
      onChange={(event) => {
        const value = event.target.value;
        if (!isLocale(value)) return;
        let storage: Storage | undefined;
        try {
          storage = window.localStorage;
        } catch {
          /* Storage may be disabled. */
        }
        changeLocale(i18n, value, storage);
      }}
    >
      {localeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
