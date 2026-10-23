import { z } from "zod";
import type { Comment } from "../../api/types.ts";
import type { AppRuntime } from "../../lib/runtime.ts";
import { queryKeys } from "../../lib/query-keys.ts";
import { runSessionAction } from "../social/actions.ts";
export const commentSchema = z.object({ content: z.string().trim().min(1, "请输入评论内容") });
export function publishComment(
  runtime: AppRuntime,
  videoId: number,
  content: string,
  signal: AbortSignal,
) {
  const value = commentSchema.parse({ content });
  const viewer = runtime.authStore.getState();
  return runSessionAction(
    runtime,
    `comment-publish:${videoId}`,
    (inner) =>
      runtime.services.comment.publish(videoId, value.content, AbortSignal.any([signal, inner])),
    () => {
      if (!signal.aborted)
        void runtime.queryClient.invalidateQueries({
          queryKey: queryKeys.comments(viewer, videoId),
          exact: true,
        });
    },
  );
}
export function deleteComment(
  runtime: AppRuntime,
  videoId: number,
  comment: Comment,
  signal: AbortSignal,
) {
  const viewer = runtime.authStore.getState();
  if (!viewer.accountId || viewer.accountId !== comment.author_id || comment.video_id !== videoId)
    throw new Error("只能删除自己的评论");
  return runSessionAction(
    runtime,
    `comment-delete:${comment.id}`,
    (inner) => runtime.services.comment.remove(comment.id, AbortSignal.any([signal, inner])),
    () => {
      if (signal.aborted) return;
      const key = queryKeys.comments(viewer, videoId);
      runtime.queryClient.setQueryData<Comment[]>(key, (old) =>
        old?.filter((item) => item.id !== comment.id),
      );
      void runtime.queryClient.invalidateQueries({ queryKey: key, exact: true });
    },
  );
}
