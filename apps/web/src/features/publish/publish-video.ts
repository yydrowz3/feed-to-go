import { AppError } from "../../i18n/app-error.ts";
import type { Video } from "../../api/types.ts";
import { retryable, uploadUrl, uploadVideoChunked, type UploadOptions } from "./upload-video.ts";
import type { PublishDraft } from "./validation.ts";

export type Checkpoints = {
  video: File | null;
  cover: File | null;
  videoUrl?: string;
  coverUrl?: string;
  uncertain?: boolean;
};
export function reconcileFiles(checkpoints: Checkpoints, video: File | null, cover: File | null) {
  if (checkpoints.video !== video) {
    checkpoints.video = video;
    delete checkpoints.videoUrl;
    delete checkpoints.uncertain;
  }
  if (checkpoints.cover !== cover) {
    checkpoints.cover = cover;
    delete checkpoints.coverUrl;
  }
}
export async function publishVideo(
  draft: PublishDraft,
  checkpoints: Checkpoints,
  options: UploadOptions,
): Promise<Video> {
  const { signal, api, onStage } = options;
  reconcileFiles(checkpoints, draft.video, draft.cover);
  signal.throwIfAborted();
  if (!draft.video || !draft.cover) throw new AppError("validation.filesRequired");
  if (checkpoints.uncertain) throw new AppError("errors.publishUncertain");
  if (!checkpoints.videoUrl)
    checkpoints.videoUrl = uploadUrl(await uploadVideoChunked(draft.video, options), "video");
  signal.throwIfAborted();
  if (!checkpoints.coverUrl) {
    onStage?.("cover");
    const result = await api.uploadCover(draft.cover, signal);
    signal.throwIfAborted();
    checkpoints.coverUrl = uploadUrl(result, "cover");
  }
  signal.throwIfAborted();
  onStage?.("publishing");
  try {
    const result = await api.publish(
      {
        title: draft.title.trim(),
        description: draft.description.trim(),
        play_url: checkpoints.videoUrl,
        cover_url: checkpoints.coverUrl,
      },
      signal,
    );
    signal.throwIfAborted();
    if (!Number.isSafeInteger(result?.id) || result.id <= 0)
      throw new AppError("errors.invalidPublishResponse");
    return result;
  } catch (error) {
    // An aborted request may still have committed on the server.
    if (retryable(error) || signal.aborted) {
      checkpoints.uncertain = true;
      throw new AppError("errors.publishUncertain", undefined, error);
    }
    throw error;
  }
}
