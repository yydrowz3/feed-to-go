import test from "node:test";
import assert from "node:assert/strict";
import { acceptsVideoShortcut } from "../src/features/video/keyboard.ts";
import { seekVideo } from "../src/features/video/seek.ts";
test("seeking waits for finite metadata and keeps playback inside the video", () => {
  const media = { duration: NaN, currentTime: 2 };
  seekVideo(media, 4);
  assert.equal(media.currentTime, 2);
  media.duration = Infinity;
  seekVideo(media, 4);
  assert.equal(media.currentTime, 2);
  media.duration = 10;
  seekVideo(media, NaN);
  assert.equal(media.currentTime, 2);
  seekVideo(media, 7.5);
  assert.equal(media.currentTime, 7.5);
  seekVideo(media, -3);
  assert.equal(media.currentTime, 0);
  seekVideo(media, 20);
  assert.equal(media.currentTime, 10);
});
test("shortcuts respect editors, IME, dialogs, modifiers and button space", () => {
  const key = { key: " ", isComposing: false };
  for (const target of [
    { tagName: "INPUT" },
    { tagName: "TEXTAREA" },
    { tagName: "SELECT" },
    { isContentEditable: true },
    { insideEditor: true },
    { tagName: "BUTTON" },
    { insideButton: true },
  ])
    assert.equal(acceptsVideoShortcut(key, target, false), false);
  assert.equal(acceptsVideoShortcut(key, {}, true), false);
  assert.equal(acceptsVideoShortcut({ ...key, isComposing: true }, {}, false), false);
  assert.equal(acceptsVideoShortcut({ ...key, ctrlKey: true }, {}, false), false);
  for (const value of [" ", "ArrowUp", "ArrowDown", "M", "c"])
    assert.equal(acceptsVideoShortcut({ ...key, key: value }, {}, false), true);
});
