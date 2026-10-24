// Opt-in production UI regression. Fixtures never forward API writes.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = await readFile(path.join(dist, "index.html"), "utf8");
const fixtureIndex = index
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
  localStorage.clear();
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
  try {
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
    await click("登录");
    await until(() => text("私信记录") || doc.querySelector('[role="log"]'), "login return");
    assert(win.location.pathname === "/messages/2", "login target");
    record("login returns to protected conversation");
    await nav("/settings");
    await until(() => text("账号设置"), "settings");
    await click("修改用户名");
    await fill("account-username", "fixture-renamed");
    win.fixture.fail("/account/rename", 401);
    await click("保存用户名");
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
    await click("修改密码");
    await until(() => win.location.pathname === "/account", "password return");
    assert(
      !win.localStorage.getItem("access_token") && !win.localStorage.getItem("refresh_token"),
      "password clears credentials",
    );
    record("fixture own-password UI clears session and returns to login");
    for (const status of [404, 429, 500, "offline"]) {
      await open("/hot");
      await until(() => text("热度榜") || text("热榜"), "hot");
      win.fixture.fail("/feed/listByPopularity", status);
      await click("刷新 / 应用");
      await until(
        () => text(status === "offline" ? "Fixture network unavailable" : `Fixture HTTP ${status}`),
        "visible failure",
      );
      assert(
        doc.querySelectorAll("[data-sonner-toast]").length === 0,
        "read error toast duplication",
      );
      await click("刷新 / 应用");
      await until(
        () => !text("Fixture HTTP") && !text("Fixture network unavailable"),
        "read recovery",
      );
    }
    record("404/429/500/offline reads preserve a retryable UI without duplicate toasts");
    await open("/messages", { failures: [["/social/getAllFollowers", 500]] });
    await until(() => text("粉丝联系人加载失败") && text("发私信"), "partial contacts");
    assert(!text("暂无联系人"), "partial failure keeps successful contacts");
    record("partial contact failure retains the successful list and separate retry");
    await nav("/messages/2");
    await until(
      () => doc.querySelector('[role="log"]')?.textContent.includes("长中文私信"),
      "messages",
    );
    await fill("message-content", "failed draft");
    win.fixture.fail("/message/send", 500);
    await click("发送");
    await until(() => text("发送失败，草稿已保留"), "draft failure");
    assert(doc.getElementById("message-content").value === "failed draft", "draft survives");
    assert(count("/message/send") === 1, "send does not retry");
    record("message failure keeps draft and never retries automatically");
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
    await click("发布视频");
    await until(() => text("Fixture HTTP 503"), "Redis unavailable UI");
    assert(count("/video/chunk/upload") === 0, "503 blocks chunks");
    win.fixture.fail("/video/chunk/upload", 500, 3);
    await click("重试发布");
    await until(
      () => count("/video/chunk/upload") === 3 && text("Fixture HTTP 500"),
      "three chunk attempts",
    );
    assert(count("/video/chunk/complete") === 0, "failed chunks block merge");
    win.fixture.fail("/video/chunk/upload", 401);
    win.fixture.fail("/video/uploadCover", 500);
    await click("重试发布");
    await until(
      () => count("/video/uploadCover") === 1 && text("Fixture HTTP 500"),
      "cover failure",
    );
    assert(count("/account/refresh") === 1, "FormData refresh");
    const merged = count("/video/chunk/complete");
    await click("重试发布");
    await until(() => text("Fixture action rejected"), "publish refusal");
    assert(count("/video/chunk/complete") === merged, "cover retry reuses video");
    const covers = count("/video/uploadCover");
    win.fixture.fail("/video/publish", "offline");
    await click("重试发布");
    await until(() => text("发布结果暂时无法确认"), "unknown publish result");
    const published = count("/video/publish");
    await click("重试发布");
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
    await click("发布视频");
    await until(() => count("/video/chunk/upload") === 1, "held upload");
    await click("取消上传");
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
    await until(() => text("账号设置"), "resource baseline");
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
              'button[aria-label="播放"],button[aria-label="暂停"]',
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
      await until(() => button("评论"), "detail");
      await click("评论");
      await until(() => doc.querySelector("dialog[open]"), "comments");
      await click("关闭");
      await until(() => !doc.querySelector("dialog[open]"), "close comments");
      assert(doc.activeElement === button("评论"), "dialog restores focus");
      await nav("/account");
      await nav("/messages");
      await until(() => text("发私信"), "contacts cycle");
      await nav("/messages/2");
      await until(() => doc.getElementById("message-content"), "conversation cycle");
      await nav("/video");
      await until(() => doc.getElementById("publish-video"), "upload cycle");
      win.fixture.files();
      await pause(80);
      assert(win.fixture.stats().objectURLs === 2, "preview URLs created");
      await nav("/settings");
      await until(() => text("账号设置"), "cleanup");
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
        `<!doctype html><html lang="zh"><title>Browser regression</title><body><h1>Production UI regression — isolated fixtures</h1><p>No backend API writes. Run after pnpm build; results distinguish fixtures from real integration.</p><button id="run">Run checks</button><pre id="results">Ready</pre><div id="frames"></div><script>document.querySelector('#run').onclick=()=>{document.querySelector('#run').disabled=true;(${runChecks.toString()})()};</script></body></html>`,
      );
      return;
    }
    if (url.pathname === "/__fixture.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`(${installFixture.toString()})();`);
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
