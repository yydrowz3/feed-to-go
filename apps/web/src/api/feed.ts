import type { ApiClient } from './client.ts'
import type { LatestInput, LikesCountInput, PopularityInput, ListLatestResponse, ListByFollowingResponse, ListLikesCountResponse, ListByPopularityResponse } from './types.ts'
import { normalizeFeedVideoList } from './normalize.ts'
export function createFeedApi(client: ApiClient) {
  return {
    async latest(input: LatestInput, signal?: AbortSignal) {
      const result = await client.postJson<ListLatestResponse>('/feed/listLatest', input, { auth: 'optional', signal })
      return { ...result, video_list: normalizeFeedVideoList(result.video_list) }
    },
    async likesCount(input: LikesCountInput, signal?: AbortSignal) {
      const body = typeof input.likes_count_before === 'number' || typeof input.id_before === 'number'
        ? { ...input, likes_count_before: input.likes_count_before ?? 0, id_before: input.id_before ?? 0 } : input
      const result = await client.postJson<ListLikesCountResponse>('/feed/listLikesCount', body, { auth: 'optional', signal })
      return { ...result, video_list: normalizeFeedVideoList(result.video_list) }
    },
    async popularity(input: PopularityInput, signal?: AbortSignal) {
      const result = await client.postJson<ListByPopularityResponse>('/feed/listByPopularity', input, { auth: 'optional', signal })
      return { ...result, video_list: normalizeFeedVideoList(result.video_list) }
    },
    async following(input: LatestInput, signal?: AbortSignal) {
      const result = await client.postJson<ListByFollowingResponse>('/feed/listByFollowing', input, { auth: 'required', signal })
      return { ...result, video_list: normalizeFeedVideoList(result.video_list) }
    },
  }
}
