import test from "node:test";
import assert from "node:assert/strict";
import { mergeContacts } from "../src/features/messages/contacts.ts";
import { orderMessages, sendMessage, validatePeer } from "../src/features/messages/actions.ts";
import { createRuntime } from "../src/lib/runtime.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

test("contacts preserve followings-first order, deduplicate by id and exclude the viewer", () => {
  const followings = [
    { id: 3, username: "same" },
    { id: 1, username: "me" },
    { id: 2, username: "same" },
  ];
  const followers = [
    { id: 2, username: "renamed" },
    { id: 4, username: "follower" },
  ];
  assert.deepEqual(mergeContacts(1, followings, followers), [
    followings[0],
    followings[2],
    followers[1],
  ]);
  assert.deepEqual(mergeContacts(1, undefined, followers), followers);
  assert.deepEqual(mergeContacts(1, followings), [followings[0], followings[2]]);
  assert.deepEqual(mergeContacts(1), []);
});
const token = (id) =>
  `e30.${Buffer.from(JSON.stringify({ account_id: id, username: "user" })).toString("base64url")}.sig`;
const message = (id, created_at = "2026-10-23T00:00:00Z") => ({
  id,
  from_id: 1,
  to_id: 2,
  content: "hello",
  created_at,
  is_read: false,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("messages sort by timestamp then id, deduplicate and leave the source unchanged", () => {
  const input = [message(3, "2026-10-23T00:00:01Z"), message(2), message(1), message(2)];
  assert.deepEqual(
    orderMessages(input).map((item) => item.id),
    [1, 2, 3],
  );
  assert.equal(input.length, 4);
  assert.deepEqual(orderMessages([]), []);
  for (const id of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 1])
    assert.throws(() => validatePeer(id, 1));
});
test("send trims input, permits one in-flight request per peer and inserts the real response once", async () => {
  const gate = deferred();
  let calls = 0;
  const runtime = createRuntime("https://backend.test", {
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, "https://backend.test/message/send");
      assert.deepEqual(JSON.parse(init.body), { to_id: 2, content: "hello" });
      return gate.promise;
    },
  });
  runtime.authStore.getState().replaceSession(token(1), "refresh");
  const key = queryKeys.messages(runtime.authStore.getState(), 2);
  runtime.queryClient.setQueryData(key, { messages: [message(1)] });
  await assert.rejects(sendMessage(runtime, 2, " "));
  await assert.rejects(sendMessage(runtime, 1, "hello"));
  assert.equal(calls, 0);
  const pending = sendMessage(runtime, 2, " hello ");
  assert.equal(await sendMessage(runtime, 2, "hello"), false);
  gate.resolve(Response.json(message(1)));
  assert.equal(await pending, true);
  assert.equal(calls, 1);
  assert.deepEqual(runtime.queryClient.getQueryData(key).messages, [message(1)]);
  runtime.dispose();
});
for (const switchAccount of [false, true])
  test(`leaving a conversation prevents late cache writes (account switch: ${switchAccount})`, async () => {
    const gate = deferred();
    const runtime = createRuntime("https://backend.test", { fetchImpl: async () => gate.promise });
    runtime.authStore.getState().replaceSession(token(1), "first");
    const controller = new AbortController();
    const pending = sendMessage(runtime, 2, "hello", controller.signal);
    if (switchAccount) runtime.authStore.getState().replaceSession(token(3), "next");
    else controller.abort();
    const nextKey = queryKeys.messages(runtime.authStore.getState(), 4);
    runtime.queryClient.setQueryData(nextKey, { messages: [message(99)] });
    gate.resolve(Response.json(message(1)));
    await assert.rejects(pending, { name: "AbortError" });
    assert.deepEqual(runtime.queryClient.getQueryData(nextKey).messages, [message(99)]);
    assert.equal(
      runtime.queryClient.getQueryData(queryKeys.messages(runtime.authStore.getState(), 2)),
      undefined,
    );
    runtime.dispose();
  });
test("failed sends preserve history and do not automatically retry", async () => {
  let calls = 0;
  const runtime = createRuntime("https://backend.test", {
    fetchImpl: async () => {
      calls++;
      return Response.json({ error: "offline" }, { status: 503 });
    },
  });
  runtime.authStore.getState().replaceSession(token(1), "refresh");
  const key = queryKeys.messages(runtime.authStore.getState(), 2);
  runtime.queryClient.setQueryData(key, { messages: [message(1)] });
  await assert.rejects(sendMessage(runtime, 2, "draft"), { message: "offline" });
  assert.equal(calls, 1);
  assert.deepEqual(runtime.queryClient.getQueryData(key).messages, [message(1)]);
  runtime.dispose();
});

test("an older history response cannot replace a successful send", async () => {
  const history = deferred();
  let historySignal;
  const runtime = createRuntime("https://backend.test", {
    fetchImpl: async (url, init) => {
      if (url.endsWith("/message/list")) {
        historySignal = init.signal;
        return history.promise;
      }
      return Response.json(message(2));
    },
  });
  runtime.authStore.getState().replaceSession(token(1), "refresh");
  const key = queryKeys.messages(runtime.authStore.getState(), 2);
  runtime.queryClient.setQueryData(key, { messages: [message(1)] });
  const pending = runtime.queryClient.fetchQuery({
    queryKey: key,
    staleTime: 0,
    queryFn: ({ signal }) => runtime.services.message.list(2, signal),
  });
  assert.equal(await sendMessage(runtime, 2, "hello"), true);
  assert.equal(historySignal.aborted, true);
  history.resolve(Response.json({ messages: [message(1)] }));
  await pending;
  assert.deepEqual(
    runtime.queryClient.getQueryData(key).messages.map((item) => item.id),
    [1, 2],
  );
  runtime.dispose();
});
