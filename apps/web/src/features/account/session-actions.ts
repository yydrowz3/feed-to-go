import { z } from "zod";
import type { AppRuntime } from "../../lib/runtime.ts";
import { safeRedirect } from "../../lib/navigation.ts";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().trim().min(1, "请输入密码"),
});

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
