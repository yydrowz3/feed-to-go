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
export const stageLabels: Record<PublishStage, string> = {
  idle: "准备发布",
  hashing: "计算文件校验值",
  initializing: "准备上传",
  uploading: "上传视频",
  checking: "核对上传进度",
  merging: "整理视频",
  cover: "上传封面",
  publishing: "发布中",
  succeeded: "发布成功",
  failed: "发布失败，可重试",
  cancelled: "上传已停止，可重新选择同一文件继续",
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
