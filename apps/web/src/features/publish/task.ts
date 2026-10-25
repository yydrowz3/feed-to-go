import type { MessageKey } from "../../i18n/app-error.ts";
export type PublishStage =
  | "idle"
  | "hashing"
  | "initializing"
  | "uploading"
  | "checking"
  | "merging"
  | "cover"
  | "publishing"
  | "succeeded"
  | "failed"
  | "cancelled";
export const stageLabels: Record<PublishStage, MessageKey> = {
  idle: "publish.stages.idle",
  hashing: "publish.stages.hashing",
  initializing: "publish.stages.initializing",
  uploading: "publish.stages.uploading",
  checking: "publish.stages.checking",
  merging: "publish.stages.merging",
  cover: "publish.stages.cover",
  publishing: "publish.stages.publishing",
  succeeded: "publish.stages.succeeded",
  failed: "publish.stages.failed",
  cancelled: "publish.stages.cancelled",
};
export function createTaskScope(getSession: () => number) {
  let sequence = 0;
  let active: { id: number; session: number; controller: AbortController } | undefined;
  return {
    start() {
      if (active) return undefined;
      const task = { id: ++sequence, session: getSession(), controller: new AbortController() };
      active = task;
      return {
        signal: task.controller.signal,
        current: () =>
          active === task && task.session === getSession() && !task.controller.signal.aborted,
        finish: () => {
          if (active === task) active = undefined;
        },
      };
    },
    cancel() {
      active?.controller.abort();
      active = undefined;
    },
  };
}
