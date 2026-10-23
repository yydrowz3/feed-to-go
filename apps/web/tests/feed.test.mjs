import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessApi } from "../src/api/index.ts";
import {
  initialCursor,
  nextCursor,
  uniqueVideos,
  filterVideos,
  shouldPrefetch,
} from "../src/features/feed/pagination.ts";
const video = (id) => ({ id, title: "  Hello  ", author: { id: 2, username: " Alice " } });
test("transport fixtures send exact second-page cursors for all four feed endpoints", async () => {
  const cases = [
    [
      "latest",
      "/feed/listLatest",
      { next_time: 1700000000123 },
      { limit: 10, latest_time: 1700000000123 },
    ],
    [
      "following",
      "/feed/listByFollowing",
      { next_time: 1700000000 },
      { limit: 10, latest_time: 1700000000 },
    ],
    [
      "likesCount",
      "/feed/listLikesCount",
      { next_likes_count_before: 0, next_id_before: 10 },
      { limit: 10, likes_count_before: 0, id_before: 10 },
    ],
    [
      "popularity",
      "/feed/listByPopularity",
      {
        as_of: 0,
        next_offset: 0,
        next_latest_popularity: 0,
        next_latest_before: "2026-10-22T00:00:00Z",
        next_latest_id_before: 10,
      },
      {
        limit: 10,
        as_of: 0,
        offset: 0,
        latest_popularity: 0,
        latest_before: "2026-10-22T00:00:00Z",
        latest_id_before: 10,
      },
    ],
  ];
  for (const [kind, path, cursor, expected] of cases) {
    const calls = [];
    const api = createBusinessApi({
      postJson: async (url, body, options) => {
        calls.push({ url, body, options });
        return {
          video_list: Array.from({ length: calls.length === 1 ? 10 : 4 }, (_, i) =>
            video(i + (calls.length === 1 ? 1 : 11)),
          ),
          ...cursor,
          has_more: calls.length === 1,
        };
      },
    });
    const first = initialCursor(kind);
    const page1 = await api.feed[kind](first);
    const next = nextCursor(kind, page1, first);
    const page2 = await api.feed[kind](next);
    assert.equal(calls[1].url, path);
    assert.deepEqual(calls[1].body, expected);
    assert.equal(calls[1].options.auth, kind === "following" ? "required" : "optional");
    assert.equal(uniqueVideos([page1, page2]).length, 14);
    assert.equal(nextCursor(kind, page2, next), undefined);
  }
});
test("feed cursors preserve seconds, milliseconds and zero likes", () => {
  for (const [kind, time] of [
    ["latest", 1700000000123],
    ["following", 1700000000],
  ]) {
    assert.deepEqual(
      nextCursor(
        kind,
        { video_list: [video(1)], next_time: time, has_more: true },
        initialCursor(kind),
      ),
      { limit: 10, latest_time: time },
    );
  }
  assert.deepEqual(
    nextCursor(
      "likesCount",
      { video_list: [video(1)], next_likes_count_before: 0, next_id_before: 4, has_more: true },
      initialCursor("likesCount"),
    ),
    { limit: 10, likes_count_before: 0, id_before: 4 },
  );
});
test("popularity supports Redis and database zero snapshot fallback", () => {
  const db = {
    video_list: [video(1)],
    has_more: true,
    as_of: 0,
    next_offset: 0,
    next_latest_popularity: 0,
    next_latest_before: "2026-10-22T00:00:00Z",
    next_latest_id_before: 4,
  };
  assert.deepEqual(nextCursor("popularity", db, initialCursor("popularity")), {
    limit: 10,
    as_of: 0,
    offset: 0,
    latest_popularity: 0,
    latest_before: db.next_latest_before,
    latest_id_before: 4,
  });
  assert.deepEqual(
    nextCursor(
      "popularity",
      { video_list: [video(1)], has_more: true, as_of: 100, next_offset: 10 },
      initialCursor("popularity"),
    ),
    { limit: 10, as_of: 100, offset: 10 },
  );
  assert.equal(
    nextCursor(
      "popularity",
      { ...db, next_latest_id_before: undefined },
      initialCursor("popularity"),
    ),
    undefined,
  );
});
test("pagination terminates for missing, repeated and empty cursors or exhausted pages", () => {
  for (const page of [
    { video_list: [], next_time: 1, has_more: true },
    { video_list: [video(1)], next_time: 0, has_more: true },
    { video_list: [video(1)], has_more: true },
    { video_list: [video(1)], next_time: 1, has_more: false },
  ])
    assert.equal(nextCursor("latest", page, initialCursor("latest")), undefined);
  for (const limit of [0, 51, 1.2, NaN]) assert.throws(() => initialCursor("popularity", limit));
});
test("deduplication preserves server ordering and search never scans pages", () => {
  const pages = [{ video_list: [video(2), video(1)] }, { video_list: [video(1), video(3)] }];
  const items = uniqueVideos(pages);
  assert.deepEqual(
    items.map((v) => v.id),
    [2, 1, 3],
  );
  assert.equal(pages[1].video_list.length, 2);
  assert.equal(filterVideos(items, " ALICE ").length, 3);
  assert.equal(filterVideos(items, "unknown").length, 0);
  assert.equal(shouldPrefetch("unknown", 0, 3, true, false, false), false);
  assert.equal(shouldPrefetch("", 7, 10, true, false, false), true);
  assert.equal(shouldPrefetch("", 7, 10, true, false, true), false);
});
