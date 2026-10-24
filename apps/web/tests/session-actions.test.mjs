import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/lib/runtime.ts";
import { queryKeys } from "../src/lib/query-keys.ts";
import {
  loginSession,
  logoutSession,
  loginSchema,
  registerAccount,
  changePassword,
  renameAccount,
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
test("registration trims fields without creating a session or sending authorization", async () => {
  const runtime = createRuntime("https://backend.test", {
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://backend.test/account/register");
      assert.equal(init.headers.Authorization, undefined);
      assert.deepEqual(JSON.parse(init.body), { username: "new", password: "p" });
      return Response.json({ message: "created" });
    },
  });
  await registerAccount(runtime, { username: " new ", password: " p " });
  assert.equal(runtime.authStore.getState().accessToken, "");
  await assert.rejects(registerAccount(runtime, { username: " ", password: "p" }));
  runtime.dispose();
});
for (const username of ["测试", "other"])
  test(`password change for ${username} only clears the matching current account`, async () => {
    const runtime = createRuntime("https://backend.test", {
      fetchImpl: async (url, init) => {
        assert.equal(url, "https://backend.test/account/changePassword");
        assert.equal(init.headers.Authorization, undefined);
        assert.deepEqual(JSON.parse(init.body), {
          username,
          old_password: "old",
          new_password: "new",
        });
        return Response.json({ message: "changed" });
      },
    });
    runtime.authStore.getState().replaceSession(token(1), "refresh");
    runtime.queryClient.setQueryData(["private"], [1]);
    await changePassword(runtime, {
      username: ` ${username} `,
      old_password: " old ",
      new_password: " new ",
    });
    assert.equal(!!runtime.authStore.getState().accessToken, username !== "测试");
    assert.deepEqual(
      runtime.queryClient.getQueryData(["private"]),
      username === "测试" ? undefined : [1],
    );
    runtime.dispose();
  });
test("late password change and failed password change preserve unrelated sessions", async () => {
  const gate = deferred();
  const runtime = createRuntime("https://backend.test", { fetchImpl: async () => gate.promise });
  runtime.authStore.getState().replaceSession(token(1), "first");
  const input = { username: "测试", old_password: "old", new_password: "new" };
  const pending = changePassword(runtime, input);
  runtime.authStore.getState().replaceSession(token(2), "second");
  gate.resolve(Response.json({ message: "changed" }));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(runtime.authStore.getState().accountId, 2);
  runtime.dispose();
  const failed = createRuntime("https://backend.test", {
    fetchImpl: async () => Response.json({ error: "wrong" }, { status: 400 }),
  });
  failed.authStore.getState().replaceSession(token(1), "refresh");
  await assert.rejects(changePassword(failed, input), { message: "wrong" });
  assert.equal(failed.authStore.getState().accountId, 1);
  assert.equal(input.old_password, "old");
  failed.dispose();
});
const namedToken = (id, username) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ account_id: id, username })).toString("base64url")}.c2ln`;
test("rename replaces only access credentials, preserves scope and invalidates account caches", async () => {
  const saved = new Map();
  const runtime = createRuntime("https://backend.test", {
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key),
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://backend.test/account/rename");
      assert.deepEqual(JSON.parse(init.body), { new_username: "new" });
      return Response.json({ token: namedToken(1, "new") });
    },
  });
  runtime.authStore.getState().replaceSession(token(1), "refresh");
  const sessionId = runtime.authStore.getState().sessionId;
  const profileKey = queryKeys.profile(runtime.authStore.getState(), 1);
  runtime.queryClient.setQueryData(profileKey, { username: "测试" });
  await renameAccount(runtime, " new ");
  assert.equal(runtime.authStore.getState().username, "new");
  assert.equal(runtime.authStore.getState().sessionId, sessionId);
  assert.equal(saved.get("refresh_token"), "refresh");
  assert.equal(saved.get("access_token"), namedToken(1, "new"));
  assert.equal(runtime.queryClient.getQueryState(profileKey).isInvalidated, true);
  runtime.dispose();
});
for (const changedSession of [true, false])
  test(`late rename cannot overwrite newer credentials (new session: ${changedSession})`, async () => {
    const gate = deferred();
    const runtime = createRuntime("https://backend.test", { fetchImpl: async () => gate.promise });
    runtime.authStore.getState().replaceSession(token(1), "refresh");
    const snapshot = runtime.authStore.getState();
    const pending = renameAccount(runtime, "old-response");
    if (changedSession) snapshot.replaceSession(namedToken(2, "other"), "other-refresh");
    else snapshot.updateTokens(snapshot.sessionId, snapshot.accessToken, namedToken(1, "newer"));
    gate.resolve(Response.json({ token: namedToken(1, "old-response") }));
    await assert.rejects(pending);
    assert.equal(runtime.authStore.getState().username, changedSession ? "other" : "newer");
    runtime.dispose();
  });

test("rename accepts the credential refresh performed by its own request", async () => {
  const requests = [];
  const refreshed = namedToken(1, "测试") + "refreshed";
  const runtime = createRuntime("https://backend.test", {
    fetchImpl: async (url, init) => {
      requests.push(url);
      if (url.endsWith("/account/refresh")) return Response.json({ token: refreshed });
      if (requests.length === 1) return Response.json({ error: "expired" }, { status: 401 });
      assert.equal(init.headers.Authorization, `Bearer ${refreshed}`);
      return Response.json({ token: namedToken(1, "renamed") });
    },
  });
  try {
    runtime.authStore.getState().replaceSession(token(1), "refresh");
    const sessionId = runtime.authStore.getState().sessionId;
    await renameAccount(runtime, "renamed");
    assert.equal(runtime.authStore.getState().username, "renamed");
    assert.equal(runtime.authStore.getState().sessionId, sessionId);
    assert.equal(runtime.authStore.getState().refreshToken, "refresh");
    assert.equal(requests.length, 3);
  } finally {
    runtime.dispose();
  }
});

test("late rename preserves a newer refresh that already observed its new name", async () => {
  const gate = deferred();
  const runtime = createRuntime("https://backend.test", { fetchImpl: async () => gate.promise });
  try {
    runtime.authStore.getState().replaceSession(token(1), "refresh");
    const snapshot = runtime.authStore.getState();
    const newer = namedToken(1, "renamed") + "newer";
    const pending = renameAccount(runtime, "renamed");
    snapshot.updateTokens(snapshot.sessionId, snapshot.accessToken, newer);
    gate.resolve(Response.json({ token: namedToken(1, "renamed") }));
    await pending;
    assert.equal(runtime.authStore.getState().accessToken, newer);
  } finally {
    runtime.dispose();
  }
});
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
