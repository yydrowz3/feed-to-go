import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/lib/runtime.ts";
import {
  loginSession,
  logoutSession,
  loginSchema,
} from "../src/features/account/session-actions.ts";
const token = (id) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ account_id: id, username: "测试" })).toString("base64url")}.c2ln`;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("login trims original required fields, persists both tokens and returns safe target", async () => {
  let sent;
  const saved = new Map();
  const runtime = createRuntime("https://backend.test", {
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key),
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://backend.test/account/login");
      assert.equal(init.headers.Authorization, undefined);
      sent = JSON.parse(init.body);
      return Response.json({ token: token(1), refresh_token: "refresh" });
    },
  });
  runtime.queryClient.setQueryData(["old"], ["private"]);
  const result = await loginSession(runtime, { username: " 测试 ", password: " pass " }, "/video");
  assert.deepEqual(sent, { username: "测试", password: "pass" });
  assert.equal(result, "/video");
  assert.equal(runtime.authStore.getState().accountId, 1);
  assert.equal(saved.get("refresh_token"), "refresh");
  assert.equal(runtime.queryClient.getQueryData(["old"]), undefined);
  assert.equal(loginSchema.safeParse({ username: " ", password: "p" }).success, false);
  assert.equal(loginSchema.safeParse({ username: "u", password: " " }).success, false);
  runtime.dispose();
});
test("failed login leaves input and session unchanged", async () => {
  const runtime = createRuntime("https://backend.test", {
    fetchImpl: async () => Response.json({ error: "用户名或密码错误" }, { status: 401 }),
  });
  const input = { username: "user", password: "wrong" };
  await assert.rejects(loginSession(runtime, input), { message: "用户名或密码错误" });
  assert.deepEqual(input, { username: "user", password: "wrong" });
  assert.equal(runtime.authStore.getState().sessionId, 0);
  runtime.dispose();
});
test("late login cannot replace a later account; unmount abort prevents login", async () => {
  const gate = deferred();
  const runtime = createRuntime("https://backend.test", { fetchImpl: async () => gate.promise });
  const pending = loginSession(runtime, { username: "user", password: "pass" });
  runtime.authStore.getState().replaceSession(token(2), "second");
  gate.resolve(Response.json({ token: token(1), refresh_token: "first" }));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(runtime.authStore.getState().accountId, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    loginSession(runtime, { username: "user", password: "pass" }, undefined, controller.signal),
    { name: "AbortError" },
  );
  runtime.dispose();
});
for (const status of [200, 503])
  test(`logout ${status} clears local identity and tasks`, async () => {
    const runtime = createRuntime("https://backend.test", {
      fetchImpl: async () => Response.json({ message: "logout" }, { status }),
    });
    runtime.authStore.getState().replaceSession(token(1), "refresh");
    let cancelled = false;
    runtime.registerSessionTask(() => {
      cancelled = true;
    });
    const result = await logoutSession(runtime);
    assert.equal(result.completed, true);
    assert.equal(Boolean(result.error), status !== 200);
    assert.equal(runtime.authStore.getState().accessToken, "");
    assert.equal(cancelled, true);
    runtime.dispose();
  });
test("old logout cannot clear or navigate over a later login", async () => {
  const gate = deferred();
  const runtime = createRuntime("https://backend.test", { fetchImpl: async () => gate.promise });
  runtime.authStore.getState().replaceSession(token(1), "first");
  const pending = logoutSession(runtime);
  runtime.authStore.getState().replaceSession(token(2), "second");
  gate.resolve(Response.json({ message: "ok" }));
  assert.equal((await pending).completed, false);
  assert.equal(runtime.authStore.getState().accountId, 2);
  runtime.dispose();
});
