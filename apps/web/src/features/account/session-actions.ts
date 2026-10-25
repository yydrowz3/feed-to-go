import { AppError } from "../../i18n/app-error.ts";
import { z } from "zod";
import type { AppRuntime } from "../../lib/runtime.ts";
import { safeRedirect } from "../../lib/navigation.ts";
import { inViewer } from "../video/cache.ts";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "validation.username"),
  password: z.string().trim().min(1, "validation.password"),
});

export async function registerAccount(runtime: AppRuntime, input: unknown, signal?: AbortSignal) {
  const credentials = loginSchema.parse(input);
  return runtime.services.account.register(credentials.username, credentials.password, signal);
}

export const changePasswordSchema = z.object({
  username: z.string().trim().min(1, "validation.username"),
  old_password: z.string().trim().min(1, "validation.oldPassword"),
  new_password: z.string().trim().min(1, "validation.newPassword"),
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
  if (current.sessionId !== snapshot.sessionId)
    throw new DOMException("errors.sessionChange", "AbortError");
  if (
    snapshot.accessToken &&
    value.username === snapshot.username &&
    current.username === value.username
  )
    current.clearSession(snapshot.sessionId);
}

export async function renameAccount(runtime: AppRuntime, input: string, signal?: AbortSignal) {
  const username = z.string().trim().min(1, "validation.newUsername").parse(input);
  const snapshot = runtime.authStore.getState();
  const result = await runtime.services.account.rename(username, signal);
  signal?.throwIfAborted();
  const current = runtime.authStore.getState();
  if (current.sessionId !== snapshot.sessionId)
    throw new DOMException("errors.sessionChange", "AbortError");
  // A 401 replay can rotate the token while this rename is in flight. Compare
  // identity changes as well so that refresh does not discard a successful rename.
  if (
    current.accessToken !== snapshot.accessToken &&
    current.username !== snapshot.username &&
    current.username !== username
  )
    throw new AppError("errors.renameCredentialsChanged");
  // A refresh that already observed the new name owns the newer credential.
  if (current.accessToken === snapshot.accessToken || current.username !== username)
    current.updateTokens(snapshot.sessionId, current.accessToken, result.token);
  const predicate = (query: { queryKey: readonly unknown[] }) => inViewer(query.queryKey, snapshot);
  await runtime.queryClient.cancelQueries({ predicate });
  if (runtime.authStore.getState().sessionId === snapshot.sessionId)
    await runtime.queryClient.invalidateQueries({ predicate });
  signal?.throwIfAborted();
  if (runtime.authStore.getState().sessionId !== snapshot.sessionId)
    throw new DOMException("errors.sessionChange", "AbortError");
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
      throw new DOMException("errors.sessionChange", "AbortError");
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
