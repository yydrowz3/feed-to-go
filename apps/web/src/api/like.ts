import type { ApiClient } from './client.ts'
import type { IsLikedResponse, MessageResponse, Video } from './types.ts'
import { normalizeVideoList } from './normalize.ts'
export function createLikeApi(client: ApiClient) {
  return {
    like: (videoId: number, signal?: AbortSignal) => client.postJson<MessageResponse>('/like/like', { video_id: videoId }, { auth: 'required', signal }),
    unlike: (videoId: number, signal?: AbortSignal) => client.postJson<MessageResponse>('/like/unlike', { video_id: videoId }, { auth: 'required', signal }),
    isLiked: (videoId: number, signal?: AbortSignal) => client.postJson<IsLikedResponse>('/like/isLiked', { video_id: videoId }, { auth: 'required', signal }),
    async listMyLikedVideos(signal?: AbortSignal) { return normalizeVideoList(await client.postJson<Video[]>('/like/listMyLikedVideos', {}, { auth: 'required', signal })) },
  }
}
