import { z } from "zod";
import type { AppRuntime } from "../../lib/runtime.ts";
import { safeRedirect } from "../../lib/navigation.ts";
import { inViewer } from "../video/cache.ts";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().trim().min(1, "请输入密码"),
});

export async function registerAccount(runtime: AppRuntime, input: unknown, signal?: AbortSignal) {
  const credentials = loginSchema.parse(input);
  return runtime.services.account.register(credentials.username, credentials.password, signal);
}

export const changePasswordSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  old_password: z.string().trim().min(1, "请输入旧密码"),
  new_password: z.string().trim().min(1, "请输入新密码"),
});

export async function changePassword(runtime: AppRuntime, input: unknown, signal?: AbortSignal) {
  const value = changePasswordSchema.parse(input);
  const snapshot = runtime.authStore.getState();
  await runtime.services.account.changePassword(
    value.username,
    value.old_password,
    value.new_password,
    signal,
  );
  signal?.throwIfAborted();
  const current = runtime.authStore.getState();
  if (current.sessionId !== snapshot.sessionId) throw new DOMException("会话已变更", "AbortError");
  if (
    snapshot.accessToken &&
    value.username === snapshot.username &&
    current.username === value.username
  )
    current.clearSession(snapshot.sessionId);
}

export async function renameAccount(runtime: AppRuntime, input: string, signal?: AbortSignal) {
  const username = z.string().trim().min(1, "请输入新用户名").parse(input);
  const snapshot = runtime.authStore.getState();
  const result = await runtime.services.account.rename(username, signal);
  signal?.throwIfAborted();
  const current = runtime.authStore.getState();
  if (current.sessionId !== snapshot.sessionId) throw new DOMException("会话已变更", "AbortError");
  if (current.accessToken !== snapshot.accessToken)
    throw new Error("登录凭据已更新，请重新提交改名");
  current.updateTokens(snapshot.sessionId, snapshot.accessToken, result.token);
  const predicate = (query: { queryKey: readonly unknown[] }) => inViewer(query.queryKey, snapshot);
  await runtime.queryClient.cancelQueries({ predicate });
  if (runtime.authStore.getState().sessionId === snapshot.sessionId)
    await runtime.queryClient.invalidateQueries({ predicate });
  signal?.throwIfAborted();
  if (runtime.authStore.getState().sessionId !== snapshot.sessionId)
    throw new DOMException("会话已变更", "AbortError");
}

export async function loginSession(
  runtime: AppRuntime,
  input: { username: string; password: string },
  redirect?: string,
  signal?: AbortSignal,
) {
  const credentials = loginSchema.parse(input);
  const sessionId = runtime.authStore.getState().sessionId;
  const controller = new AbortController();
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const unregister = runtime.registerSessionTask(() => controller.abort());
  try {
    const result = await runtime.services.account.login(
      credentials.username,
      credentials.password,
      combinedSignal,
    );
    combinedSignal.throwIfAborted();
    if (runtime.authStore.getState().sessionId !== sessionId)
      throw new DOMException("会话已变更", "AbortError");
    runtime.authStore.getState().replaceSession(result.token, result.refresh_token ?? "");
    return safeRedirect(redirect);
  } finally {
    unregister();
  }
}

export async function logoutSession(runtime: AppRuntime, signal?: AbortSignal) {
  const sessionId = runtime.authStore.getState().sessionId;
  let error: unknown;
  try {
    await runtime.services.account.logout(signal);
  } catch (cause) {
    error = cause;
  } finally {
    runtime.authStore.getState().clearSession(sessionId);
  }
  const current = runtime.authStore.getState();
  return { error, completed: current.sessionId === sessionId + 1 && !current.accessToken };
}
