import { useEffect, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { NativeDialog } from "../../components/NativeDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FormField } from "../../components/FormField";
import { LoadingState } from "../../components/LoadingState";
import { UserAvatar } from "../../components/UserAvatar";
import { useAuth, useRuntime } from "../../lib/app-context";
import { queryKeys } from "../../lib/query-keys";
import { isCancellation } from "../../api/client";
import { useRequireLogin } from "../social/use-social-actions";
import { commentSchema, publishComment, deleteComment } from "./actions";
import type { Comment } from "../../api/types";

export function CommentDrawer({
  videoId,
  title,
  open,
  onClose,
}: {
  videoId: number | null;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const auth = useAuth();
  const valid = videoId !== null && Number.isSafeInteger(videoId) && videoId > 0;
  return (
    <NativeDialog open={open && valid} title={`评论 · ${title}`} onClose={onClose} drawer>
      {open && valid && <CommentContent key={`${auth.sessionId}:${videoId}`} videoId={videoId} />}
    </NativeDialog>
  );
}
function CommentContent({ videoId }: { videoId: number }) {
  const runtime = useRuntime();
  const auth = useAuth();
  const needLogin = useRequireLogin();
  const lifetime = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Comment | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    input.current?.focus();
    return () => controller.abort();
  }, []);
  const query = useQuery({
    queryKey: queryKeys.comments(auth, videoId),
    queryFn: ({ signal }) => runtime.services.comment.listAll(videoId, signal),
    refetchOnMount: "always",
  });
  const current = (signal: AbortSignal) =>
    !signal.aborted && runtime.authStore.getState().sessionId === auth.sessionId;
  const form = useForm({
    defaultValues: { content: "" },
    validators: { onSubmit: commentSchema },
    onSubmit: async ({ value }) => {
      if (needLogin()) return;
      const signal = lifetime.current!.signal;
      setError("");
      try {
        const applied = await publishComment(runtime, videoId, value.content, signal);
        if (applied && current(signal)) {
          form.reset();
          toast.success("评论已提交");
        }
      } catch (cause) {
        if (current(signal) && !isCancellation(cause))
          setError(cause instanceof Error ? cause.message : "评论提交失败");
      }
    },
  });
  const removal = useMutation({
    mutationFn: async (comment: Comment) => {
      const signal = lifetime.current!.signal;
      try {
        const applied = await deleteComment(runtime, videoId, comment, signal);
        if (applied && current(signal)) {
          setConfirm(null);
          toast.success("评论已删除");
        }
      } catch (cause) {
        if (current(signal) && !isCancellation(cause))
          toast.error(cause instanceof Error ? cause.message : "删除失败");
      }
    },
  });
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-base-content/60">{query.data?.length ?? 0} 条评论</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      <div className="min-h-24 flex-1 space-y-4 overflow-y-auto" aria-live="polite">
        {query.isPending && <LoadingState />}
        {query.isError && (
          <p role="alert" className="text-error">
            {query.error.message}，请刷新重试。
          </p>
        )}
        {query.data?.length === 0 && (
          <p className="py-8 text-center text-base-content/60">还没有评论，来聊聊吧。</p>
        )}
        {query.data?.map((comment) => (
          <article key={comment.id} className="flex gap-3 border-b border-base-content/10 pb-4">
            <UserAvatar username={comment.username} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{comment.username}</span>
                {auth.accountId === comment.author_id && (
                  <button
                    type="button"
                    aria-label={`删除评论 ${comment.id}`}
                    className="btn btn-circle btn-ghost btn-xs text-error"
                    disabled={removal.isPending}
                    onClick={() => setConfirm(comment)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words">{comment.content}</p>
              <time
                dateTime={comment.created_at}
                className="mt-2 block text-xs text-base-content/50"
              >
                {new Date(comment.created_at).toLocaleString()}
              </time>
            </div>
          </article>
        ))}
      </div>
      <p className="text-xs text-base-content/50">提交后列表可能稍后更新，可点击刷新查看。</p>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="content">
          {(field) => (
            <FormField id="comment-content" label="写评论" errors={field.state.meta.errors}>
              <textarea
                id="comment-content"
                ref={input}
                className="textarea w-full"
                rows={3}
                placeholder="说点什么…"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={!!field.state.meta.errors.length}
                aria-describedby={
                  field.state.meta.errors.length ? "comment-content-error" : undefined
                }
              />
            </FormField>
          )}
        </form.Field>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(busy) => (
            <button
              type={auth.accessToken ? "submit" : "button"}
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                if (!auth.accessToken) needLogin();
              }}
            >
              <Send size={16} />
              {busy ? "提交中…" : auth.accessToken ? "发送评论" : "登录后评论"}
            </button>
          )}
        </form.Subscribe>
      </form>
      <ConfirmDialog
        open={!!confirm}
        title="删除评论"
        description="确认删除这条评论？"
        busy={removal.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) removal.mutate(confirm);
        }}
      />
    </>
  );
}
