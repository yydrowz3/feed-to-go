import type { ApiClient } from './client.ts'
import type { Comment, MessageResponse } from './types.ts'
import { normalizeCommentList } from './normalize.ts'
export function createCommentApi(client: ApiClient) {
  return {
    async listAll(videoId: number, signal?: AbortSignal) { return normalizeCommentList(await client.postJson<Comment[]>('/comment/listAll', { video_id: videoId }, { auth: 'none', signal })) },
    publish: (videoId: number, content: string, signal?: AbortSignal) => client.postJson<MessageResponse>('/comment/publish', { video_id: videoId, content }, { auth: 'required', signal }),
    remove: (commentId: number, signal?: AbortSignal) => client.postJson<MessageResponse>('/comment/delete', { comment_id: commentId }, { auth: 'required', signal }),
  }
}
