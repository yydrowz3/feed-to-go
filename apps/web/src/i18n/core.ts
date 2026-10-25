import { createInstance, type i18n } from "i18next";
import en from "./en.ts";
import zh from "./zh-CN.ts";
import ja from "./ja.ts";
import type { MessageKey } from "./app-error.ts";
export type Locale = "en" | "zh-CN" | "ja";
export const localeKey = "feed-to-go.locale";
export const localeOptions = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
  { value: "ja", label: "日本語" },
] as const;
export const resources = { en, "zh-CN": zh, ja };
export function isLocale(value: unknown): value is Locale {
  return localeOptions.some((option) => option.value === value);
}
export function restoreLocale(storage?: Pick<Storage, "getItem">): Locale {
  try {
    const value = storage?.getItem(localeKey);
    return isLocale(value) ? value : "en";
  } catch {
    return "en";
  }
}
export function createAppI18n(locale: Locale = "en") {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    supportedLngs: ["en", "zh-CN", "ja"],
    fallbackLng: "en",
    load: "currentOnly",
    resources: structuredClone(resources),
    ns: Object.keys(en),
    defaultNS: "common",
    keySeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}
export function translate(
  instance: i18n,
  key: MessageKey,
  params?: Record<string, unknown>,
): string {
  const dot = key.indexOf(".");
  return String(instance.t(key.slice(dot + 1), { ns: key.slice(0, dot), ...params }));
}
export function changeLocale(instance: i18n, locale: Locale, storage?: Pick<Storage, "setItem">) {
  void instance.changeLanguage(locale);
  try {
    storage?.setItem(localeKey, locale);
  } catch {
    /* The current session can still switch languages. */
  }
}
export const intlLocales = { en: "en-US", "zh-CN": "zh-CN", ja: "ja-JP" } as const;
export function formatDate(value: string | number | Date, locale: Locale): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? resources[locale].common.unknownDate
    : new Intl.DateTimeFormat(intlLocales[locale], {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocales[locale], options).format(value);
}
export function formatPlaybackTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
