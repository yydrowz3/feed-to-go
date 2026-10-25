// Opt-in production UI regression. Fixtures never forward API writes.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = await readFile(path.join(dist, "index.html"), "utf8");
const configDistArg = process.argv.indexOf("--config-dist");
const configDist = configDistArg < 0 ? null : path.resolve(process.argv[configDistArg + 1]);
const captureTheme = (html) =>
  html.replace(
    "</head>",
    `<script>window.fixtureThemeAtStartup = document.documentElement.dataset.theme;</script></head>`,
  );
const configIndex = configDist
  ? captureTheme(await readFile(path.join(configDist, "index.html"), "utf8"))
      .replaceAll("/assets/", "/__config-assets/")
      .replace("<head>", '<head><script src="/__fixture.js"></script>')
  : null;
const fixtureIndex = captureTheme(index)
  .replace("<head>", '<head><script src="/__fixture.js"></script>')
  .replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/,
    (_, src) => `<script type="module">if(window.fixture) import(${JSON.stringify(src)});</script>`,
  );
if (fixtureIndex === index || fixtureIndex.includes('<script type="module" crossorigin src='))
  throw Error("Unsupported build entry; run pnpm build before browser regression");
const mediaArg = process.argv.indexOf("--media");
const media = mediaArg < 0 ? null : await readFile(path.resolve(process.argv[mediaArg + 1]));
const port = Number(process.env.BROWSER_TEST_PORT ?? 5186);
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".html": "text/html",
};

function installFixture() {
  if (!window.name.startsWith("migration-regression:")) throw Error("Fixture iframe required");
  const config = JSON.parse(window.name.slice("migration-regression:".length));
  const originalFetch = window.fetch.bind(window);
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const failures = new Map(
    (config.failures ?? []).map(([route, status, delay = 0]) => [route, [{ status, delay }]]),
  );
  const requests = [];
  const videos = new Set();
  const urls = new Set();
  const frames = new Set();
  const timers = new Set();
  const intervals = new Set();
  const listeners = [];
  const observers = new Set();
  window.setTimeout = (fn, ms, ...args) => {
    const id = nativeTimeout(() => {
      timers.delete(id);
      fn(...args);
    }, ms);
    timers.add(id);
    return id;
  };
  window.clearTimeout = (id) => {
    timers.delete(id);
    nativeClearTimeout(id);
  };
  const nativeInterval = window.setInterval.bind(window),
    nativeClearInterval = window.clearInterval.bind(window);
  window.setInterval = (...args) => {
    const id = nativeInterval(...args);
    intervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    intervals.delete(id);
    nativeClearInterval(id);
  };
  const token = (id, username, serial = 0) =>
    `e30.${btoa(JSON.stringify({ account_id: id, username, serial }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")}.fixture`;
  let username = "fixture-one",
    serial = 0;
  if (!config.preserveLocale) localStorage.clear();
  else {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }
  if (config.locale) localStorage.setItem("feed-to-go.locale", config.locale);
  if (config.theme) localStorage.setItem("feed-to-go.theme", config.theme);
  if (config.systemTheme) {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = matchMedia(query);
      if (query === "(prefers-color-scheme: dark)")
        Object.defineProperty(result, "matches", { value: config.systemTheme === "dark" });
      return result;
    };
  }
  if (config.auth !== false) {
    localStorage.setItem("access_token", token(1, username));
    localStorage.setItem("refresh_token", "fixture-refresh");
  }
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const capture = (value) => (typeof value === "boolean" ? value : !!value?.capture);
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    if ((type === "keydown" && this === window) || type === "scroll") {
      if (
        !listeners.some(
          (x) =>
            x.target === this && x.type === type && x.fn === fn && x.capture === capture(options),
        )
      )
        listeners.push({ target: this, type, fn, capture: capture(options) });
    }
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    const i = listeners.findIndex(
      (x) => x.target === this && x.type === type && x.fn === fn && x.capture === capture(options),
    );
    if (i >= 0) listeners.splice(i, 1);
    return remove.call(this, type, fn, options);
  };
  const NativeObserver = window.ResizeObserver;
  window.ResizeObserver = class extends NativeObserver {
    observe(...args) {
      observers.add(this);
      return super.observe(...args);
    }
    disconnect() {
      observers.delete(this);
      return super.disconnect();
    }
  };
  const createURL = URL.createObjectURL.bind(URL),
    revokeURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = createURL(blob);
    urls.add(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    urls.delete(url);
    revokeURL(url);
  };
  const raf = window.requestAnimationFrame.bind(window),
    caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => {
    const id = raf((time) => {
      frames.delete(id);
      fn(time);
    });
    frames.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
    return caf(id);
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    videos.add(this);
    return play.call(this);
  };
  const account = (id) => ({ id, username: id === 1 ? username : "长中文用户名".repeat(18) });
  const video = (id) => ({
    id,
    author_id: 2,
    username: account(2).username,
    title: "长中文标题".repeat(24),
    description: "回归测试",
    play_url: location.origin + "/__clip.mp4",
    cover_url: location.origin + "/__cover.svg",
    create_time: "2026-10-24T01:00:00Z",
    likes_count: 0,
  });
  const feed = () =>
    Array.from({ length: 12 }, (_, i) => ({
      ...video(i + 1),
      author: account(2),
      create_time: 1792803600,
      is_liked: false,
    }));
  const wait = (ms, signal) =>
    new Promise((resolve, reject) => {
      const abort = () => {
        nativeClearTimeout(id);
        reject(signal.reason);
      };
      const id = nativeTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin === location.origin) return originalFetch(input, init);
    const route = url.pathname;
    const row = { path: route, status: "pending" };
    requests.push(row);
    const failure = failures.get(route)?.shift();
    if (failure?.delay) {
      try {
        await wait(failure.delay, init.signal);
      } catch (error) {
        row.status = "aborted";
        throw error;
      }
    }
    init.signal?.throwIfAborted();
    if (failure?.status === "offline") {
      row.status = "offline";
      throw new TypeError("Fixture network unavailable");
    }
    if (failure?.status) {
      row.status = failure.status;
      return Response.json({ error: `Fixture HTTP ${failure.status}` }, { status: failure.status });
    }
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    let result;
    if (route === "/account/login") {
      const id = body.username === "fixture-two" ? 2 : 1;
      username = body.username;
      result = { token: token(id, username, ++serial), refresh_token: "fixture-refresh" };
    } else if (route === "/account/refresh") result = { token: token(1, username, ++serial) };
    else if (route === "/account/rename") {
      username = body.new_username;
      result = { token: token(1, username, ++serial) };
    } else if (route === "/account/getProfile")
      result = {
        account: account(body.account_id),
        video_count: 4,
        total_likes: 0,
        follower_count: 1,
        following_count: 1,
      };
    else if (route === "/account/findByID") result = account(body.id);
    else if (route.startsWith("/account/")) result = { message: "fixture" };
    else if (route.startsWith("/feed/")) result = { video_list: feed(), has_more: false };
    else if (route === "/video/getDetail") result = video(body.id);
    else if (route === "/video/listByAUthorID") result = [video(1)];
    else if (route === "/like/isLiked") result = { is_liked: false };
    else if (route === "/like/listMyLikedVideos") result = [];
    else if (route === "/social/getAllVloggers")
      result = { followings: [account(2)], followings_count: 1 };
    else if (route === "/social/getAllFollowers")
      result = { followers: [account(2)], follower_count: 1 };
    else if (route === "/social/getCounts") result = { following_count: 1, follower_count: 1 };
    else if (route === "/message/list")
      result = {
        messages: [
          {
            id: 1,
            from_id: 2,
            to_id: 1,
            content: "长中文私信".repeat(100),
            created_at: "2026-10-24T01:00:00Z",
          },
        ],
      };
    else if (route === "/comment/listAll") result = [];
    else if (route === "/video/chunk/init")
      result = { upload_id: "fixture-upload", uploaded_chunks: [] };
    else if (route === "/video/chunk/upload")
      result = { chunk_index: Number(init.body.get("chunk_index")) };
    else if (route === "/video/chunk/status") result = { total_chunks: 1, uploaded_chunks: [0] };
    else if (route === "/video/chunk/complete") result = { url: location.origin + "/__clip.mp4" };
    else if (route === "/video/uploadCover") result = { url: location.origin + "/__cover.svg" };
    else {
      row.status = 400;
      return Response.json({ error: "Fixture action rejected" }, { status: 400 });
    }
    row.status = 200;
    return Response.json(result);
  };
  window.fixture = {
    requests,
    fail(route, status, count = 1, delay = 0) {
      failures.set(
        route,
        Array.from({ length: count }, () => ({ status, delay })),
      );
    },
    stats() {
      return {
        keydown: listeners.filter((x) => x.type === "keydown").length,
        scroll: listeners.filter((x) => x.type === "scroll").length,
        observers: observers.size,
        objectURLs: urls.size,
        raf: frames.size,
        timers: timers.size,
        intervals: intervals.size,
        playing: [...videos].filter((x) => !x.paused).length,
      };
    },
    setInput(element, value) {
      const proto =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    files() {
      for (const [kind, name, type] of [
        ["video", "fixture.mp4", "video/mp4"],
        ["cover", "fixture.png", "image/png"],
      ]) {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array([1, 2, 3])], name, { type }));
        const input = document.getElementById(`publish-${kind}`);
        input.files = data.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
  };
}

async function runChecks() {
  const report = {
    environment: navigator.userAgent,
    kind: "production UI with isolated transport fixtures; no real backend writes",
    checks: [],
    cycles: [],
  };
  const output = document.querySelector("#results");
  const host = document.querySelector("#frames");
  let frame, win, doc;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, label) => {
    const start = performance.now();
    while (!fn()) {
      if (performance.now() - start > 12000) throw Error("Timeout: " + label);
      await pause(30);
    }
    return fn();
  };
  const text = (value) => doc.body.textContent.includes(value);
  const assert = (condition, label) => {
    if (!condition) throw Error(label);
  };
  const record = (name) => {
    report.checks.push({ name, passed: true });
    output.textContent = JSON.stringify(report, null, 2);
    void fetch("/__report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
  };
  const open = async (route, config = {}) => {
    host.replaceChildren();
    frame = document.createElement("iframe");
    frame.width = "1440";
    frame.height = "900";
    frame.name = "migration-regression:" + JSON.stringify(config);
    frame.src = route;
    host.append(frame);
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
    });
    win = frame.contentWindow;
    doc = win.document;
    await until(() => doc.querySelector("main"), "application mount");
  };
  const button = (name, scope = doc) =>
    [...scope.querySelectorAll("button")].find(
      (b) =>
        !b.closest("dialog:not([open])") &&
        b.getClientRects().length &&
        (b.getAttribute("aria-label") === name || b.textContent.trim() === name),
    );
  const click = async (name) => {
    const b = await until(() => {
      const b = button(name);
      return b && !b.disabled ? b : null;
    }, name);
    b.focus();
    b.click();
    await pause(80);
  };
  const nav = async (route) => {
    const a = [...doc.querySelectorAll("a[href]")].find((a) => new URL(a.href).pathname === route);
    assert(a, "Missing link " + route);
    a.click();
    await until(() => win.location.pathname === route, route);
    await pause(100);
  };
  const fill = async (id, value) => {
    win.fixture.setInput(await until(() => doc.getElementById(id), id), value);
    await pause(40);
  };
  const count = (route) => win.fixture.requests.filter((r) => r.path === route).length;
  const switchLanguage = async (locale) => {
    const select = await until(() => doc.querySelector("select"), "language selector");
    select.value = locale;
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
    await until(() => doc.documentElement.lang === locale, "locale " + locale);
  };
  const submit = async () => {
    const element = doc.querySelector('[data-testid="form-submit"]');
    assert(element && !element.disabled, "submit available");
    element.click();
    await pause(80);
  };
  const toggleTheme = async () => {
    const previous = doc.documentElement.dataset.theme;
    const toggle = await until(
      () => doc.querySelector('[data-testid="theme-toggle"]'),
      "theme toggle",
    );
    toggle.click();
    const expected = previous === "night" ? "light" : "night";
    await until(() => doc.documentElement.dataset.theme === expected, "theme change");
    assert(
      doc.documentElement.style.colorScheme === (expected === "night" ? "dark" : "light"),
      "native control color scheme",
    );
    await pause(40);
    return expected;
  };
  try {
    await open("/", { locale: "en" });
    await until(() => doc.querySelector(".snap-y"), "unfiltered feed");
    const hasQuery = () => new URL(win.location.href).searchParams.has("q");
    const searchInput = () => doc.querySelector("header input");
    const searchFor = async (value) => {
      win.fixture.setInput(searchInput(), value);
      await pause(40);
      await click("Search");
    };
    assert(!hasQuery(), "initial homepage omits q");
    const itemCount = doc.querySelector(".snap-y").children.length;
    await nav("/settings");
    await nav("/");
    assert(!hasQuery(), "homepage navigation omits q");
    for (const value of ["", "   "]) {
      await searchFor(value);
      assert(!hasQuery(), "blank search omits q");
    }
    await searchFor("  中文标题  ");
    await until(
      () => new URL(win.location.href).searchParams.get("q") === "中文标题",
      "trimmed Chinese search query",
    );
    await until(() => doc.querySelector(".snap-y"), "matching search results");
    await searchFor("no-matching-video");
    await until(() => !doc.querySelector(".snap-y"), "nonmatching search filters feed");
    for (const value of ["", "   "]) {
      await searchFor("中文标题");
      await until(() => hasQuery(), "active search query");
      await searchFor(value);
      await until(() => !hasQuery(), "cleared search omits q");
      await until(
        () => doc.querySelector(".snap-y")?.children.length === itemCount,
        "cleared search restores unfiltered feed",
      );
    }
    for (const route of ["/feed", "/feed?q=", "/feed?q=%20%20"]) {
      await open(route, { locale: "en" });
      await until(() => win.location.pathname === "/", "legacy feed redirect");
      assert(!hasQuery(), "legacy feed redirect omits blank q");
      assert(searchInput().value === "", "empty search input after redirect");
    }
    for (const route of ["/?q=", "/?q=%20%20", "/?q=1"]) {
      await open(route, { locale: "en" });
      await until(() => !hasQuery(), "invalid initial query removed");
      assert(searchInput().value === "", "empty input for invalid initial query");
    }
    await open("/feed?q=" + encodeURIComponent("中文标题"), { locale: "en" });
    await until(() => win.location.pathname === "/", "legacy search redirect");
    assert(
      new URL(win.location.href).searchParams.get("q") === "中文标题",
      "legacy feed redirect preserves non-empty query",
    );
    record("empty searches and home/feed navigation omit q; active searches still filter results");

    for (const systemTheme of ["light", "dark"]) {
      await open("/account", { auth: false, systemTheme });
      const expected = systemTheme === "dark" ? "night" : "light";
      assert(win.fixtureThemeAtStartup === expected, "system theme before React mounts");
      assert(doc.documentElement.dataset.theme === expected, "React reuses initial theme");
      assert(!win.localStorage.getItem("feed-to-go.theme"), "system default is not saved");
      await fill("login-username", "theme-draft");
      const header = doc.querySelector("header");
      const background = win.getComputedStyle(header).backgroundColor;
      await toggleTheme();
      assert(win.getComputedStyle(header).backgroundColor !== background, "page colors change");
      assert(
        doc.getElementById("login-username").value === "theme-draft",
        "theme preserves form draft",
      );
      const saved = win.localStorage.getItem("feed-to-go.theme");
      assert(saved === (systemTheme === "dark" ? "light" : "dark"), "manual preference saved");
      await open("/account", { auth: false, systemTheme, preserveLocale: true });
      assert(
        win.fixtureThemeAtStartup === (saved === "dark" ? "night" : "light"),
        "saved preference restored before React",
      );
      assert(
        doc.documentElement.dataset.theme === win.fixtureThemeAtStartup,
        "saved preference survives mount",
      );
    }
    record(
      "system light/dark before React, saved preference restoration, page colors and form draft preservation",
    );
    await open("/account", { auth: false });
    assert(doc.documentElement.lang === "en", "first visit uses English");
    await fill("login-username", "draft-原文");
    await submit();
    await until(() => text("Enter a password."), "English validation");
    for (const [locale, error] of [
      ["zh-CN", "请输入密码"],
      ["ja", "パスワードを入力してください"],
      ["en", "Enter a password."],
    ]) {
      await switchLanguage(locale);
      assert(text(error), "existing validation updates " + locale);
      assert(
        doc.getElementById("login-username").value === "draft-原文",
        "input survives locale change",
      );
    }
    await switchLanguage("ja");
    await open("/account", { auth: false, preserveLocale: true });
    assert(doc.documentElement.lang === "ja", "preference restored on reload");
    record(
      "English default, three-language switching, validation and draft preservation, preference restoration",
    );
    for (const locale of ["en", "zh-CN", "ja"]) {
      for (const [route, ready] of [
        ["/", "video"],
        ["/hot", "ol"],
        ["/account", '[role="tablist"]'],
        ["/settings", '[data-testid="signout-open"]'],
        ["/video", "#publish-title"],
        ["/u/2", "h1"],
        ["/messages", "ul"],
        ["/messages/2", '[role="log"]'],
        ["/video/1", '[data-testid="comments-open"]'],
        ["/account/register", "#account-username"],
        ["/account/change-password", "#account-old_password"],
      ]) {
        await open(route, { locale });
        await until(() => doc.querySelector(ready), "localized route " + route);
        for (const width of [1440, 390]) {
          frame.width = String(width);
          frame.height = String(width === 390 ? 844 : 900);
          await pause(100);
          assert(
            doc.documentElement.scrollWidth <= width,
            "three-language overflow " + route + "/" + locale + "/" + width,
          );
          const select = doc.querySelector("header select");
          assert(select?.getClientRects().length, "visible language selector");
          const toggle = doc.querySelector('[data-testid="theme-toggle"]');
          const labels = {
            en: ["Switch to light mode", "Switch to dark mode"],
            "zh-CN": ["切换到浅色", "切换到深色"],
            ja: ["ライトモードに切り替え", "ダークモードに切り替え"],
          };
          for (let mode = 0; mode < 2; mode++) {
            const rect = toggle.getBoundingClientRect();
            assert(rect.width > 0 && rect.left >= 0 && rect.right <= width, "visible theme toggle");
            assert(
              toggle.getAttribute("aria-label") ===
                labels[locale][doc.documentElement.dataset.theme === "night" ? 0 : 1],
              "localized theme action",
            );
            await toggleTheme();
            assert(doc.documentElement.scrollWidth <= width, "theme layout overflow");
          }
        }
      }
    }
    record(
      "English, Chinese and Japanese layouts in both themes at 1440x900 and 390x844 keep language and theme controls accessible",
    );
    for (const [locale, registered] of [
      ["en", "Account created. Please sign in."],
      ["zh-CN", "注册成功，请登录"],
      ["ja", "登録しました。ログインしてください。"],
    ]) {
      await open("/account/register", { auth: false, locale });
      await fill("account-username", "fixture-new");
      await fill("account-password", "fixture-pass");
      await submit();
      await until(
        () => doc.querySelector("[data-sonner-toast]")?.textContent.includes(registered),
        "localized toast",
      );
      for (let mode = 0; mode < 2; mode++) {
        const theme = await toggleTheme();
        assert(
          doc.querySelector("[data-sonner-toaster]")?.dataset.sonnerTheme ===
            (theme === "night" ? "dark" : "light"),
          "visible toast follows theme",
        );
        assert(doc.querySelector("[data-sonner-toast]"), "theme keeps visible toast");
      }
      await switchLanguage("en");
      assert(
        doc
          .querySelector("[data-sonner-toast]")
          ?.textContent.includes("Account created. Please sign in."),
        "visible toast updates",
      );
      await open("/video/1", { locale });
      await until(() => doc.querySelector('[data-testid="comments-open"]'), "comments trigger");
      doc.querySelector('[data-testid="comments-open"]').click();
      await until(() => doc.querySelector("dialog[open]"), "localized dialog");
      await fill("comment-content", "comment-原文");
      await switchLanguage("en");
      assert(
        doc.querySelector("dialog[open]") &&
          doc.getElementById("comment-content").value === "comment-原文",
        "dialog and draft survive language change",
      );
    }
    record(
      "three-language success toasts and comment dialogs update in place while preserving comment drafts",
    );
    await open("/settings", { locale: "ja" });
    await until(() => doc.querySelector('[data-testid="signout-open"]'), "sign-out control");
    await toggleTheme();
    const savedTheme = win.localStorage.getItem("feed-to-go.theme");
    doc.querySelector('[data-testid="signout-open"]').click();
    await until(() => doc.querySelector("dialog[open]"), "sign-out confirmation");
    doc.querySelector('[data-testid="confirm-action"]').click();
    await until(() => !win.localStorage.getItem("access_token"), "sign-out");
    await until(() => win.location.pathname === "/", "sign-out navigation");
    await nav("/account");
    await fill("login-username", "fixture-one");
    await fill("login-password", "fixture-pass");
    await submit();
    await until(() => win.localStorage.getItem("access_token"), "sign-in");
    assert(
      doc.documentElement.lang === "ja" && win.localStorage.getItem("feed-to-go.locale") === "ja",
      "locale survives sign-out and sign-in",
    );
    record("language preference survives sign-out and sign-in");
    assert(
      win.localStorage.getItem("feed-to-go.theme") === savedTheme &&
        doc.documentElement.dataset.theme === (savedTheme === "dark" ? "night" : "light"),
      "theme survives sign-out and sign-in",
    );
    record("theme preference survives sign-out and sign-in");
    if (configIndexAvailable) {
      await open("/__config", { auth: false, locale: "ja" });
      await until(() => text("アプリの設定エラー"), "localized configuration error");
      await switchLanguage("zh-CN");
      assert(text("应用配置错误"), "configuration error switches language");
      await toggleTheme();
      assert(!doc.querySelector("main[data-theme]"), "configuration page inherits global theme");
      assert(
        win.getComputedStyle(doc.querySelector("main")).colorScheme ===
          doc.documentElement.style.colorScheme,
        "configuration page uses selected scheme",
      );
      record(
        "configuration errors restore and switch language and theme before the application runtime exists",
      );
    }
    for (const route of ["/video", "/settings", "/messages", "/messages/2"]) {
      await open(route, { auth: false });
      await until(() => win.location.pathname === "/account", "anonymous guard");
      const redirect = new URL(win.location.href).searchParams.get("redirect");
      assert(
        redirect && new URL(redirect, win.location.origin).pathname === route,
        "redirect preservation",
      );
    }
    record("anonymous guards preserve all four protected targets");
    await fill("login-username", "fixture-one");
    await fill("login-password", "fixture-pass");
    await click("Sign in");
    await until(() => text("Message history") || doc.querySelector('[role="log"]'), "login return");
    assert(win.location.pathname === "/messages/2", "login target");
    record("login returns to protected conversation");
    await nav("/settings");
    await until(() => text("Account settings"), "settings");
    await click("Change username");
    await fill("account-username", "fixture-renamed");
    win.fixture.fail("/account/rename", 401);
    await click("Save username");
    await until(
      () => text("fixture-renamed") && !doc.querySelector("dialog[open]"),
      "rename after refresh",
    );
    assert(count("/account/refresh") === 1, "one refresh");
    record("rename succeeds through one 401 refresh replay");
    await nav("/account/change-password");
    await until(() => doc.getElementById("account-old_password"), "password form");
    await fill("account-old_password", "fixture-pass");
    await fill("account-new_password", "fixture-new-pass");
    await click("Change password");
    await until(() => win.location.pathname === "/account", "password return");
    assert(
      !win.localStorage.getItem("access_token") && !win.localStorage.getItem("refresh_token"),
      "password clears credentials",
    );
    record("fixture own-password UI clears session and returns to login");
    for (const status of [404, 429, 500, "offline"]) {
      await open("/hot");
      await until(() => text("Trending") || text("Trending"), "hot");
      win.fixture.fail("/feed/listByPopularity", status);
      await click("Refresh / Apply");
      await until(
        () =>
          text(
            status === "offline"
              ? "Unable to connect."
              : status === 429
                ? "Too many requests."
                : status === 404
                  ? "Unable to load this page."
                  : "A server error occurred.",
          ),
        "visible failure",
      );
      assert(
        doc.querySelectorAll("[data-sonner-toast]").length === 0,
        "read error toast duplication",
      );
      await click("Refresh / Apply");
      await until(() => !doc.querySelector('[role="alert"]'), "read recovery");
    }
    record("404/429/500/offline reads preserve a retryable UI without duplicate toasts");
    await open("/messages", { failures: [["/social/getAllFollowers", 500]] });
    await until(
      () => text("Unable to load follower contacts") && text("Message"),
      "partial contacts",
    );
    assert(!text("No contacts yet"), "partial failure keeps successful contacts");
    record("partial contact failure retains the successful list and separate retry");
    await nav("/messages/2");
    await until(
      () => doc.querySelector('[role="log"]')?.textContent.includes("长中文私信"),
      "messages",
    );
    await fill("message-content", "failed draft");
    win.fixture.fail("/message/send", 500);
    await click("Send");
    await until(() => text("Sending failed. Your draft was kept."), "draft failure");
    assert(doc.getElementById("message-content").value === "failed draft", "draft survives");
    assert(count("/message/send") === 1, "send does not retry");
    await switchLanguage("ja");
    assert(text("下書きは保存されています"), "retained message guidance updates");
    assert(
      doc.getElementById("message-content").value === "failed draft",
      "message draft survives language switch",
    );
    await switchLanguage("en");
    record(
      "message failure keeps draft and never retries automatically; guidance updates on language switch",
    );
    for (const width of [1440, 390, 360]) {
      frame.width = String(width);
      await pause(100);
      assert(doc.documentElement.scrollWidth <= width, "page overflow " + width);
      const log = doc.querySelector('[role="log"]');
      assert(log.scrollWidth <= log.clientWidth, "message overflow " + width);
    }
    record("1440/390/360 CSS viewports contain long Chinese messages and usernames");
    await open("/messages/2", { failures: [["/message/list", 0, 5000]] });
    await until(() => count("/message/list") === 1, "slow message request");
    await nav("/settings");
    await until(
      () => win.fixture.requests.some((r) => r.path === "/message/list" && r.status === "aborted"),
      "late query cancellation",
    );
    assert(!doc.querySelector("[data-sonner-toast]"), "cancellation stays quiet");
    record("leaving a slow conversation aborts its request without a stale error toast");
    await open("/video");
    await until(() => doc.getElementById("publish-title"), "publish form");
    await fill("publish-title", "fixture upload");
    win.fixture.files();
    await pause(80);
    win.fixture.fail("/video/chunk/init", 503);
    await click("Publish video");
    await until(() => text("Upload service is unavailable."), "Redis unavailable UI");
    assert(count("/video/chunk/upload") === 0, "503 blocks chunks");
    win.fixture.fail("/video/chunk/upload", 500, 3);
    await click("Retry publishing");
    await until(
      () => count("/video/chunk/upload") === 3 && text("A server error occurred."),
      "three chunk attempts",
    );
    assert(count("/video/chunk/complete") === 0, "failed chunks block merge");
    win.fixture.fail("/video/chunk/upload", 401);
    win.fixture.fail("/video/uploadCover", 500);
    await click("Retry publishing");
    await until(
      () => count("/video/uploadCover") === 1 && text("A server error occurred."),
      "cover failure",
    );
    assert(count("/account/refresh") === 1, "FormData refresh");
    const merged = count("/video/chunk/complete");
    await click("Retry publishing");
    await until(() => text("Invalid request."), "publish refusal");
    assert(count("/video/chunk/complete") === merged, "cover retry reuses video");
    const covers = count("/video/uploadCover");
    win.fixture.fail("/video/publish", "offline");
    await click("Retry publishing");
    await until(() => text("The publishing result is unknown."), "unknown publish result");
    const published = count("/video/publish");
    await click("Retry publishing");
    await pause(150);
    assert(
      count("/video/publish") === published && count("/video/uploadCover") === covers,
      "unknown result blocks resubmission",
    );
    record(
      "503 init, three chunk attempts, FormData refresh, cover checkpoint, publish rejection and unknown-result protection",
    );
    await open("/video");
    await until(() => doc.getElementById("publish-title"), "cancel form");
    await fill("publish-title", "cancelled fixture");
    win.fixture.files();
    await pause(80);
    win.fixture.fail("/video/chunk/upload", 0, 1, 60000);
    await click("Publish video");
    await until(() => count("/video/chunk/upload") === 1, "held upload");
    const selected = doc.getElementById("publish-video").files[0];
    await toggleTheme();
    assert(
      doc.getElementById("publish-video").files[0] === selected,
      "theme preserves selected upload file",
    );
    assert(
      doc.getElementById("publish-title").value === "cancelled fixture",
      "theme preserves upload draft",
    );
    assert(count("/video/chunk/upload") === 1, "theme does not restart upload");
    await switchLanguage("ja");
    assert(
      doc.getElementById("publish-video").files[0] === selected,
      "selected upload file survives language switch",
    );
    assert(
      doc.getElementById("publish-title").value === "cancelled fixture",
      "upload draft survives language switch",
    );
    assert(count("/video/chunk/upload") === 1, "language switch does not restart upload");
    await switchLanguage("en");
    await click("Cancel upload");
    await until(() => win.fixture.requests.some((r) => r.status === "aborted"), "upload aborted");
    assert(
      count("/video/chunk/complete") === 0 && count("/video/uploadCover") === 0,
      "cancel stops pipeline",
    );
    assert(
      doc.getElementById("publish-title").value === "cancelled fixture",
      "cancel retains draft",
    );
    record("upload cancellation aborts transport, stops later stages and retains the draft");
    await nav("/settings");
    await until(() => text("Account settings"), "resource baseline");
    const baseline = win.fixture.stats();
    for (let cycle = 0; cycle < 12; cycle++) {
      await nav("/");
      await until(() => doc.querySelectorAll("video").length >= 2, "feed videos");
      assert(doc.querySelectorAll("video").length <= 3, "only adjacent videos mount");
      if (cycle === 0) {
        const scroller = doc.querySelector(".snap-y");
        const height = scroller.scrollHeight;
        for (let i = 0; i < 10; i++) {
          scroller.scrollTop = i * scroller.clientHeight;
          await until(() => {
            const b = scroller.children[i]?.querySelector(
              'button[aria-label="Play"],button[aria-label="Pause"]',
            );
            return b && !b.disabled;
          }, "active slide " + i);
          assert(scroller.scrollHeight === height, "stable scroll placeholders");
          assert(
            doc.querySelectorAll("video").length <= 3 && win.fixture.stats().playing <= 1,
            "single active playback",
          );
        }
        record("ten video scroll positions preserve height, position and adjacent-only playback");
      }
      await nav("/video/1");
      await until(() => button("Comments"), "detail");
      if (cycle === 0) {
        const video = doc.querySelector("video");
        const time = video?.currentTime;
        const paused = video?.paused;
        await toggleTheme();
        assert(doc.querySelector("video") === video, "player survives theme change");
        assert(
          !video || (video.currentTime >= time && video.paused === paused),
          "theme preserves playback position and state",
        );
        await switchLanguage("ja");
        assert(doc.querySelector("video") === video, "player element survives locale change");
        assert(!video || video.currentTime >= time, "playback position survives locale change");
        await switchLanguage("en");
        record("video element and playback position survive language switching");
      }
      await click("Comments");
      await until(() => doc.querySelector("dialog[open]"), "comments");
      await click("Close");
      await until(() => !doc.querySelector("dialog[open]"), "close comments");
      assert(doc.activeElement === button("Comments"), "dialog restores focus");
      await nav("/account");
      await nav("/messages");
      await until(() => text("Message"), "contacts cycle");
      await nav("/messages/2");
      await until(() => doc.getElementById("message-content"), "conversation cycle");
      await nav("/video");
      await until(() => doc.getElementById("publish-video"), "upload cycle");
      win.fixture.files();
      await pause(80);
      assert(win.fixture.stats().objectURLs === 2, "preview URLs created");
      await nav("/settings");
      await until(() => text("Account settings"), "cleanup");
      await pause(100);
      const stats = win.fixture.stats();
      report.cycles.push(stats);
      assert(
        stats.playing === 0 && stats.objectURLs === 0 && stats.raf === 0 && stats.observers === 0,
        "resource leak " + JSON.stringify(stats),
      );
      assert(
        stats.keydown === baseline.keydown && stats.scroll === baseline.scroll,
        "listener growth",
      );
      assert(stats.intervals <= baseline.intervals, "interval growth");
      if (cycle >= 3)
        assert(
          stats.timers <= Math.max(...report.cycles.slice(0, 3).map((x) => x.timers)),
          "timer growth",
        );
      output.textContent = JSON.stringify(report, null, 2);
    }
    record(
      "12 SPA cycles release videos, preview URLs, scroll/key listeners, ResizeObservers and RAF; dialogs restore focus",
    );
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
  }
  output.textContent = JSON.stringify(report, null, 2);
  document.title = "Browser regression: " + report.status;
  document.querySelector("h1").textContent = document.title;
  await fetch("/__report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
}

let latestReport = { status: "not_run" };
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/__report") {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST") {
        if (
          ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)
        ) {
          res.writeHead(403).end();
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) {
            res.writeHead(413).end();
            return;
          }
        }
        const report = JSON.parse(body);
        if (!Array.isArray(report.checks) || !Array.isArray(report.cycles)) {
          res.writeHead(400).end();
          return;
        }
        if (!latestReport.status || latestReport.status === "not_run" || report.status)
          latestReport = report;
      }
      res.end(JSON.stringify(latestReport));
      return;
    }
    if (url.pathname === "/__checks") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><html lang="en"><title>Browser regression</title><body><h1>Production UI regression — isolated fixtures</h1><p>No backend API writes. Run after pnpm build; results distinguish fixtures from real integration.</p><button id="run">Run checks</button><pre id="results">Ready</pre><div id="frames"></div><script>const configIndexAvailable = ${Boolean(configIndex)};document.querySelector('#run').onclick=()=>{document.querySelector('#run').disabled=true;(${runChecks.toString()})()};</script></body></html>`,
      );
      return;
    }
    if (url.pathname === "/__fixture.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`(${installFixture.toString()})();`);
      return;
    }
    if (url.pathname === "/__config" && configIndex) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(configIndex);
      return;
    }
    if (url.pathname.startsWith("/__config-assets/") && configDist) {
      const file = path.resolve(
        configDist,
        "assets",
        url.pathname.slice("/__config-assets/".length),
      );
      if (!file.startsWith(path.join(configDist, "assets") + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
      res.end(await readFile(file));
      return;
    }
    if (url.pathname === "/__clip.mp4") {
      if (!media) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader("Content-Type", "video/mp4");
      res.end(media);
      return;
    }
    if (url.pathname === "/__cover.svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#18354c"/></svg>',
      );
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      const file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(dist + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
      res.end(await readFile(file));
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fixtureIndex);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Open http://127.0.0.1:${port}/__checks and click Run checks. Stop with Ctrl+C. No API or media proxy is configured.`,
  ),
);
