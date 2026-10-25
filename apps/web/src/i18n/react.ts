import { useTranslation } from "react-i18next";
import { formatDate, formatNumber, isLocale, translate, type Locale } from "./core.ts";
import type { MessageKey } from "./app-error.ts";
import { errorMessage } from "./errors.ts";
export function useAppTranslation() {
  const { i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "en";
  const t = (key: MessageKey, params?: Record<string, unknown>) => translate(i18n, key, params);
  return {
    t,
    locale,
    message(value: unknown, fallback?: MessageKey) {
      const descriptor = errorMessage(value, fallback);
      return t(descriptor.key, descriptor.params);
    },
    date: (value: string | number | Date) => formatDate(value, locale),
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, locale, options),
  };
}
