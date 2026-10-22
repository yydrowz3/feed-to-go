import type { ApiClient } from './client.ts'
import type { Video, PublishInput, UploadResponse, InitChunkInput, InitChunkResponse, ChunkStatusResponse } from './types.ts'
import { listOrEmpty, normalizeVideo, normalizeVideoList } from './normalize.ts'
export function createVideoApi(client: ApiClient) {
  return {
    async getDetail(id: number, signal?: AbortSignal) { return normalizeVideo(await client.postJson<Video>('/video/getDetail', { id }, { auth: 'none', signal })) },
    async listByAuthorID(authorId: number, signal?: AbortSignal) { return normalizeVideoList(await client.postJson<Video[] | null>('/video/listByAUthorID', { author_id: authorId }, { auth: 'none', signal })) },
    publish: (input: PublishInput, signal?: AbortSignal) => client.postJson<Video>('/video/publish', input, { auth: 'required', signal }),
    uploadCover(file: File, signal?: AbortSignal) {
      const form = new FormData(); form.append('file', file)
      return client.postForm<UploadResponse>('/video/uploadCover', form, { auth: 'required', signal })
    },
    async initChunkUpload(input: InitChunkInput, signal?: AbortSignal) {
      const result = await client.postJson<InitChunkResponse>('/video/chunk/init', input, { auth: 'required', signal })
      return { ...result, uploaded_chunks: listOrEmpty(result.uploaded_chunks) }
    },
    uploadChunk(uploadId: string, chunkIndex: number, chunkHash: string, blob: Blob, signal?: AbortSignal) {
      const form = new FormData(); form.append('upload_id', uploadId); form.append('chunk_index', String(chunkIndex)); form.append('chunk_hash', chunkHash); form.append('file', blob)
      return client.postForm<{ chunk_index: number }>('/video/chunk/upload', form, { auth: 'required', signal })
    },
    async chunkStatus(uploadId: string, signal?: AbortSignal) {
      const result = await client.postJson<ChunkStatusResponse>('/video/chunk/status', { upload_id: uploadId }, { auth: 'required', signal })
      return { ...result, uploaded_chunks: listOrEmpty(result.uploaded_chunks) }
    },
    completeChunkUpload: (uploadId: string, signal?: AbortSignal) => client.postJson<UploadResponse>('/video/chunk/complete', { upload_id: uploadId }, { auth: 'required', signal }),
  }
}
