import { AppError } from "../../i18n/app-error.ts";
import type { createVideoApi } from "../../api/video.ts";
import type { PublishStage } from "./task.ts";
import { computeFileMd5, computeBlobMd5 } from "../../lib/hash.ts";
import { ApiError } from "../../api/client.ts";
import type { UploadResponse } from "../../api/types.ts";

export const CHUNK_SIZE = 5 * 1024 * 1024;
export type UploadApi = ReturnType<typeof createVideoApi>;
export type UploadOptions = {
  api: UploadApi;
  signal: AbortSignal;
  fileHash?: string;
  onStage?: (stage: PublishStage) => void;
  onProgress?: (confirmedBytes: number) => void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};
export function abortableWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export function retryable(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError && error.status >= 500 && error.status <= 599)
  );
}
export function uploadUrl(result: UploadResponse, kind: "video" | "cover"): string {
  const value = result?.[kind === "video" ? "play_url" : "cover_url"] || result?.url;
  if (
    typeof value === "string" &&
    value.trim() &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    try {
      const url = new URL(value, "https://backend.invalid");
      if (
        ["http:", "https:"].includes(url.protocol) &&
        (value.startsWith("/") || /^https?:\/\//i.test(value))
      )
        return value;
    } catch {
      /* reject invalid media locations */
    }
  }
  throw new AppError("errors.uploadMediaMissing");
}
export function normalizeChunks(value: unknown, total: number): Set<number> {
  return new Set(
    Array.isArray(value)
      ? value.filter((index) => Number.isInteger(index) && index >= 0 && index < total)
      : [],
  );
}
export function confirmedBytes(fileSize: number, chunks: Set<number>): number {
  return [...chunks].reduce(
    (bytes, index) => bytes + Math.min(CHUNK_SIZE, fileSize - index * CHUNK_SIZE),
    0,
  );
}
export async function initializeUpload(file: File, options: UploadOptions) {
  const { api, signal, onStage, onProgress } = options;
  signal.throwIfAborted();
  if (!file.size) throw new AppError("validation.videoRequired");
  if (!options.fileHash) onStage?.("hashing");
  const fileHash = options.fileHash ?? (await computeFileMd5(file, { signal }));
  signal.throwIfAborted();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  onStage?.("initializing");
  const result = await api.initChunkUpload(
    {
      filename: file.name,
      file_size: file.size,
      chunk_size: CHUNK_SIZE,
      total_chunks: totalChunks,
      file_hash: fileHash,
    },
    signal,
  );
  signal.throwIfAborted();
  if (typeof result?.upload_id !== "string" || !result.upload_id.trim())
    throw new AppError("errors.uploadIdMissing");
  const uploaded = normalizeChunks(result.uploaded_chunks, totalChunks);
  onProgress?.(confirmedBytes(file.size, uploaded));
  return { uploadId: result.upload_id, totalChunks, uploaded };
}
export async function uploadMissing(
  file: File,
  state: Awaited<ReturnType<typeof initializeUpload>>,
  options: UploadOptions,
) {
  const { signal, api, onStage, onProgress, wait = abortableWait } = options;
  onStage?.("uploading");
  for (let index = 0; index < state.totalChunks; index++) {
    signal.throwIfAborted();
    if (state.uploaded.has(index)) continue;
    const chunk = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    const chunkHash = await computeBlobMd5(chunk);
    signal.throwIfAborted();
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await api.uploadChunk(state.uploadId, index, chunkHash, chunk, signal);
        signal.throwIfAborted();
        if (result?.chunk_index !== index) throw new AppError("errors.chunkMismatch");
        break;
      } catch (error) {
        signal.throwIfAborted();
        if (attempt >= 2 || !retryable(error)) throw error;
        await wait(500 * (attempt + 1), signal);
        signal.throwIfAborted();
      }
    }
    state.uploaded.add(index);
    onProgress?.(confirmedBytes(file.size, state.uploaded));
  }
}
export async function uploadVideoChunked(
  file: File,
  options: UploadOptions,
): Promise<UploadResponse> {
  const { api, signal, onStage, onProgress } = options;
  const state = await initializeUpload(file, options);
  await uploadMissing(file, state, options);
  async function check() {
    signal.throwIfAborted();
    onStage?.("checking");
    const result = await api.chunkStatus(state.uploadId, signal);
    signal.throwIfAborted();
    if (result?.total_chunks !== state.totalChunks) throw new AppError("errors.chunkCountMismatch");
    state.uploaded = normalizeChunks(result.uploaded_chunks, state.totalChunks);
    onProgress?.(confirmedBytes(file.size, state.uploaded));
    return state.uploaded.size === state.totalChunks;
  }
  if (!(await check())) {
    await uploadMissing(file, state, options);
    if (!(await check())) throw new AppError("errors.chunksUnconfirmed");
  }
  signal.throwIfAborted();
  onStage?.("merging");
  let result: UploadResponse;
  try {
    result = await api.completeChunkUpload(state.uploadId, signal);
  } catch (error) {
    signal.throwIfAborted();
    if (retryable(error)) throw new AppError("errors.mergeUncertain", undefined, error);
    throw error;
  }
  signal.throwIfAborted();
  uploadUrl(result, "video");
  return result;
}
