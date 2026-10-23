import { z } from "zod";
import type { DirectMessage, ListMessagesResponse } from "../../api/types.ts";
import type { AppRuntime } from "../../lib/runtime.ts";
import { queryKeys } from "../../lib/query-keys.ts";
import { parseResourceId } from "../../lib/navigation.ts";
import { createActionGate } from "../../lib/action-gate.ts";

export const messageSchema = z.object({ content: z.string().trim().min(1, "请输入消息内容") });
export function validatePeer(peerId: number, viewerId: number) {
  parseResourceId(String(peerId));
  if (peerId === viewerId) throw new Error("不能向自己发送私信");
  return peerId;
}
export function orderMessages(messages: DirectMessage[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const timestamp = (message: DirectMessage) => Date.parse(message.created_at) || 0;
  return [...byId.values()].sort((a, b) => timestamp(a) - timestamp(b) || a.id - b.id);
}
const gates = new WeakMap<AppRuntime, ReturnType<typeof createActionGate>>();
export async function sendMessage(
  runtime: AppRuntime,
  peerId: number,
  content: string,
  signal?: AbortSignal,
) {
  const viewer = runtime.authStore.getState();
  validatePeer(peerId, viewer.accountId);
  if (!viewer.accessToken) throw new Error("请先登录");
  const value = messageSchema.parse({ content });
  let gate = gates.get(runtime);
  if (!gate) {
    gate = createActionGate();
    gates.set(runtime, gate);
  }
  return gate.run(`${viewer.sessionId}:${peerId}`, async () => {
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const release = runtime.registerSessionTask(() => controller.abort());
    try {
      const message = await runtime.services.message.send(peerId, value.content, combined);
      combined.throwIfAborted();
      if (runtime.authStore.getState().sessionId !== viewer.sessionId) return false;
      const key = queryKeys.messages(viewer, peerId);
      await runtime.queryClient.cancelQueries({ queryKey: key, exact: true });
      combined.throwIfAborted();
      if (runtime.authStore.getState().sessionId !== viewer.sessionId) return false;
      runtime.queryClient.setQueryData<ListMessagesResponse>(key, (old) => ({
        messages: orderMessages([...(old?.messages ?? []), message]),
      }));
      return true;
    } finally {
      release();
    }
  });
}
