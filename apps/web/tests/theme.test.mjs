import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createThemeStore, themeKey } from "../src/stores/theme.ts";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script id="theme-init">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "theme initialization is a blocking head script");
assert.ok(html.indexOf('id="theme-init"') < html.indexOf("</head>"));

function initialize({ saved, dark = false, storageDenied = false, mediaUnavailable = false } = {}) {
  const root = { dataset: {}, style: {} };
  let mediaReads = 0;
  const window = {
    get localStorage() {
      if (storageDenied) throw Error("Storage disabled");
      return { getItem: (key) => (key === themeKey ? saved : null) };
    },
    matchMedia(query) {
      mediaReads++;
      assert.equal(query, "(prefers-color-scheme: dark)");
      if (mediaUnavailable) throw Error("Unavailable");
      return { matches: dark };
    },
  };
  vm.runInNewContext(script, { window, document: { documentElement: root } });
  return { theme: root.dataset.theme, colorScheme: root.style.colorScheme, mediaReads };
}

test("first paint uses the system preference without persisting an automatic choice", () => {
  assert.deepEqual(initialize(), { theme: "light", colorScheme: "light", mediaReads: 1 });
  assert.deepEqual(initialize({ dark: true }), {
    theme: "night",
    colorScheme: "dark",
    mediaReads: 1,
  });
});

test("saved light and dark preferences override the system without querying it", () => {
  assert.deepEqual(initialize({ saved: "light", dark: true }), {
    theme: "light",
    colorScheme: "light",
    mediaReads: 0,
  });
  assert.deepEqual(initialize({ saved: "dark" }), {
    theme: "night",
    colorScheme: "dark",
    mediaReads: 0,
  });
});

test("invalid preferences and storage denial fall back to the system; missing media defaults to light", () => {
  for (const saved of [undefined, null, "", "night", "DARK", "invalid"]) {
    assert.equal(initialize({ saved }).theme, "light");
    assert.equal(initialize({ saved, dark: true }).theme, "night");
  }
  assert.equal(initialize({ storageDenied: true, dark: true }).theme, "night");
  assert.equal(initialize({ storageDenied: true, mediaUnavailable: true }).theme, "light");
  assert.equal(initialize({ saved: "dark", mediaUnavailable: true }).theme, "night");
});

test("React state reuses the head result; repeated toggles apply and persist only the theme", () => {
  for (const dark of [false, true]) {
    const initial = initialize({ dark }).colorScheme;
    const applied = [],
      writes = [],
      updates = [];
    const store = createThemeStore(initial, {
      apply: (theme) => applied.push(theme),
      storage: { setItem: (key, value) => writes.push([key, value]) },
    });
    store.subscribe((state) => updates.push(state.theme));
    assert.equal(store.getState().theme, initial);
    assert.deepEqual(applied, [initial]);
    assert.deepEqual(writes, []);
    const opposite = dark ? "light" : "dark";
    store.getState().toggleTheme();
    store.getState().toggleTheme();
    assert.equal(store.getState().theme, initial);
    assert.deepEqual(applied, [initial, opposite, initial]);
    assert.deepEqual(updates, [opposite, initial]);
    assert.deepEqual(writes, [
      [themeKey, opposite],
      [themeKey, initial],
    ]);
  }
});

test("switching remains available without storage and when saving fails", () => {
  for (const storage of [
    undefined,
    {
      setItem() {
        throw Error("Quota exceeded");
      },
    },
  ]) {
    let applied;
    const store = createThemeStore("light", {
      storage,
      apply: (theme) => {
        applied = theme;
      },
    });
    store.getState().toggleTheme();
    assert.equal(store.getState().theme, "dark");
    assert.equal(applied, "dark");
    store.getState().toggleTheme();
    assert.equal(store.getState().theme, "light");
    assert.equal(applied, "light");
  }
});
