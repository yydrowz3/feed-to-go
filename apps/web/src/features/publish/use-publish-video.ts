import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../../lib/app-context";
import { computeFileMd5 } from "../../lib/hash";
import { isCancellation } from "../../api/client";
import { toast } from "../../i18n/toast";
import type { Video } from "../../api/types";
import { queryKeys } from "../../lib/query-keys";
import { createTaskScope, type PublishStage } from "./task";
import type { PublishDraft } from "./validation";
import { publishVideo, reconcileFiles, type Checkpoints } from "./publish-video";

export function usePublishVideo() {
  const runtime = useRuntime();
  const [scope] = useState(() => createTaskScope(() => runtime.authStore.getState().sessionId));
  const hash = useRef<{ file: File; value: string } | null>(null);
  const checkpoints = useRef<Checkpoints>({ video: null, cover: null });
  const [result, setResult] = useState<Video | null>(null);
  const [stage, setStage] = useState<PublishStage>("idle");
  const [hashProgress, setHashProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const phase = useRef<PublishStage>("idle");
  useEffect(() => {
    const unregister = runtime.registerSessionTask(() => scope.cancel());
    return () => {
      unregister();
      scope.cancel();
    };
  }, [runtime, scope]);
  async function submit(draft: PublishDraft) {
    if (!draft.video || !draft.cover) return;
    const task = scope.start();
    if (!task) return;
    setBusy(true);
    setTotalBytes(draft.video.size);
    setError(null);
    setStage("hashing");
    phase.current = "hashing";
    try {
      const value =
        hash.current?.file === draft.video
          ? hash.current.value
          : await computeFileMd5(draft.video, {
              signal: task.signal,
              onProgress: (value) => {
                if (task.current()) setHashProgress(value);
              },
            });
      if (!task.current()) return;
      hash.current = { file: draft.video, value };
      setHashProgress(1);
      const options = {
        api: runtime.services.video,
        signal: task.signal,
        fileHash: value,
        onStage: (value: PublishStage) => {
          if (task.current()) {
            phase.current = value;
            setStage(value);
          }
        },
        onProgress: (bytes: number) => {
          if (task.current()) setUploadProgress(bytes);
        },
      };
      const result = await publishVideo(draft, checkpoints.current, options);
      if (!task.current()) return;
      const viewer = runtime.authStore.getState();
      runtime.queryClient.setQueryData(queryKeys.video(viewer, result.id), result);
      void runtime.queryClient.invalidateQueries({
        queryKey: queryKeys.authorVideos(viewer, viewer.accountId),
      });
      void runtime.queryClient.invalidateQueries({
        queryKey: queryKeys.profile(viewer, viewer.accountId),
      });
      void runtime.queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "feed" && query.queryKey[1] === viewer.sessionId,
      });
      checkpoints.current = { video: null, cover: null };
      hash.current = null;
      setTotalBytes(0);
      setResult(result);
      setStage("succeeded");
      setUploadProgress(0);
      setHashProgress(0);
      toast.success("publish.success");
      return result;
    } catch (cause) {
      if (!task.current()) return;
      setStage(isCancellation(cause) ? "cancelled" : "failed");
      setError(cause);
      if (!isCancellation(cause)) toast.error(cause);
    } finally {
      if (task.current()) setBusy(false);
      task.finish();
    }
  }
  return {
    submit,
    stage,
    hashProgress,
    uploadProgress,
    totalBytes,
    error,
    busy,
    result,
    changeFile(kind: "video" | "cover", file: File | null) {
      reconcileFiles(
        checkpoints.current,
        kind === "video" ? file : checkpoints.current.video,
        kind === "cover" ? file : checkpoints.current.cover,
      );
      if (kind === "video") {
        setTotalBytes(file?.size ?? 0);
        hash.current = null;
        setHashProgress(0);
        setUploadProgress(0);
      }
    },
    cancel() {
      if (phase.current === "publishing") {
        checkpoints.current.uncertain = true;
        setError("errors.publishCancelledUncertain");
      } else if (phase.current === "merging") {
        setError("errors.mergeCancelledUncertain");
      } else setError(null);
      scope.cancel();
      setBusy(false);
      setStage("cancelled");
    },
  };
}
