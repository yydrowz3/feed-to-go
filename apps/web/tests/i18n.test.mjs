import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  createAppI18n,
  restoreLocale,
  changeLocale,
  resources,
  translate,
  formatDate,
  formatNumber,
  formatPlaybackTime,
  localeKey,
} from "../src/i18n/core.ts";
import { AppError } from "../src/i18n/app-error.ts";
import { errorMessage } from "../src/i18n/errors.ts";
import { ApiError } from "../src/api/client.ts";
import { NetworkError } from "../src/api/network-error.ts";
import { errorCodes } from "../src/api/error-codes.gen.ts";
import {
  normalizeAccount,
  normalizeVideo,
  normalizeFeedVideoItem,
  normalizeCommentList,
} from "../src/api/normalize.ts";
import { loginSchema } from "../src/features/account/session-actions.ts";

test("locale restoration defaults to English without browser detection and tolerates storage failures", () => {
  assert.equal(restoreLocale(), "en");
  for (const value of ["en", "zh-CN", "ja"])
    assert.equal(restoreLocale({ getItem: () => value }), value);
  for (const value of [null, "", "zh", "EN", "fr"])
    assert.equal(restoreLocale({ getItem: () => value }), "en");
  assert.equal(
    restoreLocale({
      getItem() {
        throw Error("denied");
      },
    }),
    "en",
  );
  const instance = createAppI18n();
  assert.equal(instance.language, "en");
  let saved;
  changeLocale(instance, "ja", {
    setItem: (key, value) => {
      saved = [key, value];
    },
  });
  assert.deepEqual(saved, [localeKey, "ja"]);
  changeLocale(instance, "zh-CN", {
    setItem() {
      throw Error("denied");
    },
  });
  assert.equal(translate(instance, "account.signIn"), "登录");
  assert.equal(createAppI18n().language, "en");
});

const params = (text) => [...text.matchAll(/{{\s*([^}, ]+)/g)].map((match) => match[1]).sort();
test("all namespaces, keys, nonempty translations and interpolation parameters agree", () => {
  assert.deepEqual(
    Object.keys(resources.en).sort(),
    [
      "common",
      "navigation",
      "account",
      "feed",
      "video",
      "comments",
      "social",
      "messages",
      "publish",
      "errors",
      "validation",
    ].sort(),
  );
  for (const locale of ["zh-CN", "ja"]) {
    assert.deepEqual(Object.keys(resources[locale]).sort(), Object.keys(resources.en).sort());
    for (const [ns, values] of Object.entries(resources.en)) {
      assert.deepEqual(
        Object.keys(resources[locale][ns]).sort(),
        Object.keys(values).sort(),
        `${locale}/${ns}`,
      );
      for (const [key, text] of Object.entries(values)) {
        const translated = resources[locale][ns][key];
        assert.ok(translated.trim(), `${locale}/${ns}/${key}`);
        assert.deepEqual(params(translated), params(text), `${locale}/${ns}/${key}`);
      }
    }
  }
});

test("English plural forms handle zero, one and many; missing translations fall back to English", () => {
  const instance = createAppI18n();
  for (const [count, expected] of [
    [0, "No comments"],
    [1, "1 comment"],
    [2, "2 comments"],
  ])
    assert.equal(
      translate(instance, "comments.count", { count, formatted: formatNumber(count, "en") }),
      expected,
    );
  instance.removeResourceBundle("ja", "account");
  void instance.changeLanguage("ja");
  assert.equal(translate(instance, "account.signIn"), "Sign in");
  // Independent instances must have independent resource stores, including mutations.
  assert.equal(translate(createAppI18n("ja"), "account.signIn"), "ログイン");
});

test("shared API codes have a translated mapping in every language; raw backend text is never shown", () => {
  for (const code of errorCodes)
    for (const locale of ["en", "zh-CN", "ja"]) {
      const message = errorMessage(new ApiError("private backend details", 500, { code }));
      assert.equal(message.key, `errors.api.${code}`);
      assert.ok(translate(createAppI18n(locale), message.key).trim());
      assert.notEqual(translate(createAppI18n(locale), message.key), message.key);
    }
  for (const payload of [undefined, { code: "FUTURE_ERROR" }, "<html>private</html>"]) {
    assert.equal(errorMessage(new ApiError("private", 403, payload)).key, "errors.api.FORBIDDEN");
  }
  assert.equal(
    errorMessage(new NetworkError(new TypeError("Failed to fetch"))).key,
    "errors.network",
  );
  assert.equal(errorMessage(new TypeError("application bug")).key, "errors.actionFailed");
  assert.equal(errorMessage(new Error("private")).key, "errors.actionFailed");
  assert.equal(
    errorMessage(new AppError("errors.publishUncertain")).key,
    "errors.publishUncertain",
  );
});

test("existing validation and recovery descriptions translate after a language change", () => {
  const instance = createAppI18n();
  const issue = loginSchema.safeParse({ username: "", password: "" }).error.issues[0];
  const message = errorMessage(issue.message);
  const before = translate(instance, message.key);
  void instance.changeLanguage("ja");
  assert.notEqual(translate(instance, message.key), before);
  const recovery = new AppError("errors.publishUncertain", undefined, Error("transport"));
  assert.equal(recovery.cause.message, "transport");
  assert.match(translate(instance, errorMessage(recovery).key), /投稿結果/);
});

test("date and number formatting use explicit locales and device timezone; playback stays mm:ss", () => {
  const date = new Date("2026-10-24T00:00:00Z");
  for (const [locale, intl] of [
    ["en", "en-US"],
    ["zh-CN", "zh-CN"],
    ["ja", "ja-JP"],
  ]) {
    assert.equal(
      formatDate(date, locale),
      new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short" }).format(date),
    );
    assert.equal(formatDate("invalid", locale), resources[locale].common.unknownDate);
    assert.equal(formatNumber(1234567.8, locale), new Intl.NumberFormat(intl).format(1234567.8));
  }
  assert.equal(formatPlaybackTime(65.8), "01:05");
  assert.equal(formatPlaybackTime(NaN), "00:00");
});

test("normalization keeps user content and empty display fallbacks out of business caches", () => {
  const name = "<img onerror=x>用户日本語",
    title = "My 原文 title";
  assert.equal(normalizeAccount({ id: 1, username: name }).username, name);
  assert.equal(normalizeVideo({ id: 1, title, username: name }).title, title);
  assert.equal(
    normalizeFeedVideoItem({ id: 1, author: { id: 1, username: "" }, title: "" }).title,
    "",
  );
  assert.equal(normalizeAccount({ id: 1 }).username, "");
  assert.equal(normalizeCommentList([{ id: 1, username: "", content: "原文" }])[0].content, "原文");
});

test("generated error contracts match the shared source", () => {
  execFileSync(process.execPath, ["../../scripts/generate-error-codes.mjs", "--check"]);
  const rows = JSON.parse(fs.readFileSync("../../shared/error-codes.json", "utf8"));
  assert.deepEqual(
    errorCodes,
    rows.map((row) => row.code),
  );
});
