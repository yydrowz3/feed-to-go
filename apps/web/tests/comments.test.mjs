import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/lib/runtime.ts";
import { queryKeys } from "../src/lib/query-keys.ts";
import { commentSchema, publishComment, deleteComment } from "../src/features/comments/actions.ts";
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ account_id: 1, username: "测试" })).toString("base64url")}.c2ln`;
const comment = { id: 4, author_id: 1, video_id: 8, content: "原评论" };
function fixture(fetchImpl = async () => Response.json({ message: "accepted" })) {
  const runtime = createRuntime("https://backend.test", { fetchImpl });
  runtime.authStore.getState().replaceSession(token, "refresh");
  const viewer = runtime.authStore.getState();
  runtime.queryClient.setQueryData(queryKeys.comments(viewer, 8), [comment]);
  runtime.queryClient.setQueryData(queryKeys.comments(viewer, 9), [{ ...comment, video_id: 9 }]);
  return { runtime, viewer, signal: new AbortController().signal };
}
test("publish trims content, rejects whitespace and refreshes only its captured video without fabricating comments", async () => {
  let sent;
  const { runtime, viewer, signal } = fixture(async (_url, request) => {
    sent = JSON.parse(request.body);
    return Response.json({ message: "accepted" });
  });
  assert.equal(commentSchema.safeParse({ content: " \n " }).success, false);
  assert.equal(await publishComment(runtime, 8, " hello ", signal), true);
  assert.deepEqual(sent, { video_id: 8, content: "hello" });
  assert.deepEqual(runtime.queryClient.getQueryData(queryKeys.comments(viewer, 8)), [comment]);
  assert.equal(
    runtime.queryClient.getQueryState(queryKeys.comments(viewer, 8)).isInvalidated,
    true,
  );
  assert.equal(
    runtime.queryClient.getQueryState(queryKeys.comments(viewer, 9)).isInvalidated,
    false,
  );
  runtime.dispose();
});
test("delete verifies ownership and captured video before sending and removes only a successful comment", async () => {
  let calls = 0;
  const { runtime, viewer, signal } = fixture(async (_url, request) => {
    calls++;
    assert.deepEqual(JSON.parse(request.body), { comment_id: 4 });
    return Response.json({ message: "ok" });
  });
  assert.throws(() => deleteComment(runtime, 8, { ...comment, author_id: 2 }, signal));
  assert.throws(() => deleteComment(runtime, 9, comment, signal));
  assert.equal(calls, 0);
  assert.equal(await deleteComment(runtime, 8, comment, signal), true);
  assert.deepEqual(runtime.queryClient.getQueryData(queryKeys.comments(viewer, 8)), []);
  assert.equal(runtime.queryClient.getQueryData(queryKeys.comments(viewer, 9)).length, 1);
  runtime.dispose();
});
test("failed publish and delete preserve existing server comments", async () => {
  const { runtime, viewer, signal } = fixture(async () =>
    Response.json({ error: "unavailable" }, { status: 503 }),
  );
  await assert.rejects(publishComment(runtime, 8, "draft", signal));
  await assert.rejects(deleteComment(runtime, 8, comment, signal));
  assert.deepEqual(runtime.queryClient.getQueryData(queryKeys.comments(viewer, 8)), [comment]);
  assert.equal(
    runtime.queryClient.getQueryState(queryKeys.comments(viewer, 8)).isInvalidated,
    false,
  );
  runtime.dispose();
});
test("closing or changing the video aborts late publication without invalidating a new video", async () => {
  let resolve;
  const gate = new Promise((r) => {
    resolve = r;
  });
  const { runtime, viewer } = fixture(async () => gate);
  const controller = new AbortController();
  const pending = publishComment(runtime, 8, "old draft", controller.signal);
  controller.abort();
  resolve(Response.json({ message: "accepted" }));
  await assert.rejects(pending, { name: "AbortError" });
  for (const id of [8, 9])
    assert.equal(
      runtime.queryClient.getQueryState(queryKeys.comments(viewer, id)).isInvalidated,
      false,
    );
  runtime.dispose();
});
