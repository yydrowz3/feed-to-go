import type { ApiClient } from './client.ts'
import type { GetAllFollowersResponse, GetAllFollowingsResponse, MessageResponse, SocialCounts } from './types.ts'
import { listOrEmpty, normalizeAccount } from './normalize.ts'
export function createSocialApi(client: ApiClient) {
  return {
    follow: (followingId: number, signal?: AbortSignal) => client.postJson<MessageResponse>('/social/follow', { following_id: followingId }, { auth: 'required', signal }),
    unfollow: (followingId: number, signal?: AbortSignal) => client.postJson<MessageResponse>('/social/unfollow', { following_id: followingId }, { auth: 'required', signal }),
    async getAllFollowers(followingId?: number, signal?: AbortSignal) {
      const result = await client.postJson<GetAllFollowersResponse>('/social/getAllFollowers', followingId === undefined ? {} : { following_id: followingId }, { auth: 'required', signal })
      return { ...result, followers: listOrEmpty(result.followers).map(normalizeAccount) }
    },
    async getAllVloggers(followerId?: number, signal?: AbortSignal) {
      const result = await client.postJson<GetAllFollowingsResponse>('/social/getAllVloggers', followerId === undefined ? {} : { follower_id: followerId }, { auth: 'required', signal })
      return { ...result, followings: listOrEmpty(result.followings).map(normalizeAccount) }
    },
    getCounts: (signal?: AbortSignal) => client.postJson<SocialCounts>('/social/getCounts', {}, { auth: 'required', signal }),
  }
}
