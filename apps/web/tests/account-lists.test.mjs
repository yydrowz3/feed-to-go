import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/lib/runtime.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

for (const liked of [false, true])
  test(`late ${liked ? "liked" : "works"} query cannot enter the next account cache`, async () => {
    let resolve, started;
    const ready = new Promise((r) => {
      started = r;
    });
    const gate = new Promise((r) => {
      resolve = r;
    });
    const token = (id) =>
      `e30.${Buffer.from(JSON.stringify({ account_id: id, username: "user" })).toString("base64url")}.sig`;
    const runtime = createRuntime("https://backend.test", {
      fetchImpl: async () => {
        started();
        return gate;
      },
    });
    runtime.authStore.getState().replaceSession(token(1), "first");
    const key = liked
      ? queryKeys.likedVideos(runtime.authStore.getState())
      : queryKeys.authorVideos(runtime.authStore.getState(), 1);
    const pending = runtime.queryClient.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        liked
          ? runtime.services.like.listMyLikedVideos(signal)
          : runtime.services.video.listByAuthorID(1, signal),
    });
    const rejected = assert.rejects(pending);
    await ready;
    runtime.authStore.getState().replaceSession(token(2), "second");
    resolve(Response.json([]));
    await rejected;
    assert.equal(runtime.queryClient.getQueryData(key), undefined);
    assert.equal(runtime.queryClient.getQueryCache().getAll().length, 0);
    runtime.dispose();
  });
