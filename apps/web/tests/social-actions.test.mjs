import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/lib/runtime.ts";
import { queryKeys } from "../src/lib/query-keys.ts";
import { likeVideo, followAuthor } from "../src/features/social/actions.ts";
const token = (id) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ account_id: id, username: "测试" })).toString("base64url")}.c2ln`;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const video = { id: 8, likes_count: 0, is_liked: false };
function fixture(fetchImpl = async () => Response.json({ message: "ok" })) {
  const runtime = createRuntime("https://backend.test", { fetchImpl });
  runtime.authStore.getState().replaceSession(token(1), "refresh");
  const viewer = runtime.authStore.getState();
  const feed = {
    pages: [{ video_list: [video, { ...video, id: 9 }], next_time: 10, has_more: true }],
    pageParams: [{ limit: 10, latest_time: 0 }],
  };
  for (const kind of ["latest", "following", "likesCount", "popularity"])
    runtime.queryClient.setQueryData(queryKeys.feed(viewer, kind, 10), feed);
  runtime.queryClient.setQueryData(queryKeys.video(viewer, 8), { id: 8, likes_count: 0 });
  runtime.queryClient.setQueryData(
    queryKeys.feed({ sessionId: 99, accountId: 2 }, "latest", 10),
    feed,
  );
  return { runtime, viewer, feed };
}
test("simultaneous likes share one action and patch all current caches without reordering or changing cursors", async () => {
  const gate = deferred();
  let calls = 0;
  const { runtime, viewer, feed } = fixture(async (_url, request) => {
    calls++;
    assert.deepEqual(JSON.parse(request.body), { video_id: 8 });
    return gate.promise;
  });
  const first = likeVideo(runtime, 8, false);
  assert.equal(await likeVideo(runtime, 8, false), false);
  assert.equal(calls, 1);
  assert.equal(runtime.queryClient.getQueryData(queryKeys.video(viewer, 8)).likes_count, 0);
  gate.resolve(Response.json({ message: "accepted" }));
  assert.equal(await first, true);
  for (const kind of ["latest", "following", "likesCount", "popularity"]) {
    const result = runtime.queryClient.getQueryData(queryKeys.feed(viewer, kind, 10));
    assert.deepEqual(result.pageParams, feed.pageParams);
    assert.equal(result.pages[0].next_time, 10);
    assert.deepEqual(
      result.pages[0].video_list.map((v) => v.id),
      [8, 9],
    );
    assert.equal(result.pages[0].video_list[0].is_liked, true);
    assert.equal(
      runtime.queryClient.getQueryState(queryKeys.feed(viewer, kind, 10)).isInvalidated,
      true,
    );
  }
  assert.equal(runtime.queryClient.getQueryData(queryKeys.video(viewer, 8)).likes_count, 1);
  assert.deepEqual(runtime.queryClient.getQueryData(queryKeys.liked(viewer, 8)), {
    is_liked: true,
  });
  assert.equal(
    runtime.queryClient.getQueryData(queryKeys.feed({ sessionId: 99, accountId: 2 }, "latest", 10))
      .pages[0].video_list[0].likes_count,
    0,
  );
  runtime.dispose();
});
test("failed actions retain caches, release the gate and unlike counts stay nonnegative", async () => {
  let fail = true;
  const { runtime, viewer } = fixture(async () =>
    fail ? Response.json({ error: "offline" }, { status: 503 }) : Response.json({ message: "ok" }),
  );
  await assert.rejects(likeVideo(runtime, 8, false), { message: "offline" });
  assert.equal(runtime.queryClient.getQueryData(queryKeys.video(viewer, 8)).likes_count, 0);
  assert.equal(runtime.queryClient.getQueryData(queryKeys.liked(viewer, 8)), undefined);
  fail = false;
  assert.equal(await likeVideo(runtime, 8, true), true);
  assert.equal(runtime.queryClient.getQueryData(queryKeys.video(viewer, 8)).likes_count, 0);
  runtime.dispose();
});
test("unlike removes cached liked videos and new likes only insert complete Video data", async () => {
  const { runtime, viewer } = fixture();
  const key = queryKeys.likedVideos(viewer);
  runtime.queryClient.setQueryData(key, []);
  await likeVideo(runtime, 8, false);
  assert.deepEqual(runtime.queryClient.getQueryData(key), []);
  const complete = {
    id: 8,
    author_id: 1,
    username: "测试",
    title: "video",
    play_url: "/static/a.mp4",
    cover_url: "",
    create_time: "2026-10-23T00:00:00Z",
    likes_count: 1,
  };
  runtime.queryClient.setQueryData(queryKeys.video(viewer, 8), complete);
  runtime.queryClient.setQueryData(queryKeys.authorVideos(viewer, 1), [complete]);
  await likeVideo(runtime, 8, false);
  assert.equal(runtime.queryClient.getQueryData(key)[0].create_time, complete.create_time);
  assert.equal(runtime.queryClient.getQueryData(key)[0].likes_count, 2);
  assert.equal(runtime.queryClient.getQueryState(key).isInvalidated, true);
  await likeVideo(runtime, 8, true);
  assert.deepEqual(runtime.queryClient.getQueryData(key), []);
  assert.equal(
    runtime.queryClient.getQueryData(queryKeys.authorVideos(viewer, 1))[0].likes_count,
    1,
  );
  runtime.dispose();
});
test("account switches abort late actions and prevent old cache writes", async () => {
  const gate = deferred();
  let signal;
  const { runtime } = fixture(async (_url, request) => {
    signal = request.signal;
    return gate.promise;
  });
  const result = likeVideo(runtime, 8, false);
  runtime.authStore.getState().replaceSession(token(2), "other");
  assert.equal(signal.aborted, true);
  const viewer = runtime.authStore.getState();
  runtime.queryClient.setQueryData(queryKeys.video(viewer, 8), { id: 8, likes_count: 10 });
  gate.resolve(Response.json({ message: "accepted" }));
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(runtime.queryClient.getQueryData(queryKeys.video(viewer, 8)).likes_count, 10);
  assert.equal(runtime.queryClient.getQueryData(queryKeys.liked(viewer, 8)), undefined);
  runtime.dispose();
});
test("follow actions share a gate, patch followings and invalidate relevant social and following keys", async () => {
  const gate = deferred();
  let calls = 0;
  const { runtime, viewer } = fixture(async (_url, request) => {
    calls++;
    assert.deepEqual(JSON.parse(request.body), { following_id: 2 });
    return gate.promise;
  });
  const own = queryKeys.followings(viewer, 1);
  runtime.queryClient.setQueryData(own, { followings: [], followings_count: 0 });
  runtime.queryClient.setQueryData(queryKeys.followers(viewer, 2), {
    followers: [],
    follower_count: 7,
  });
  for (const key of [
    queryKeys.profile(viewer, 2),
    queryKeys.socialCounts(viewer, 1),
    queryKeys.contacts(viewer),
  ])
    runtime.queryClient.setQueryData(key, {});
  const first = followAuthor(runtime, { id: 2, username: "作者" }, false);
  assert.equal(await followAuthor(runtime, { id: 2, username: "作者" }, false), false);
  assert.equal(calls, 1);
  gate.resolve(Response.json({ message: "ok" }));
  assert.equal(await first, true);
  assert.deepEqual(runtime.queryClient.getQueryData(own), {
    followings: [{ id: 2, username: "作者" }],
    followings_count: 1,
  });
  assert.deepEqual(runtime.queryClient.getQueryData(queryKeys.followers(viewer, 2)), {
    followers: [{ id: 1, username: "测试" }],
    follower_count: 8,
  });
  for (const key of [
    own,
    queryKeys.profile(viewer, 2),
    queryKeys.socialCounts(viewer, 1),
    queryKeys.contacts(viewer),
    queryKeys.feed(viewer, "following", 10),
  ])
    assert.equal(runtime.queryClient.getQueryState(key).isInvalidated, true);
  assert.equal(
    runtime.queryClient.getQueryState(queryKeys.feed(viewer, "latest", 10)).isInvalidated,
    false,
  );
  runtime.dispose();
});
