import type { ApiClient } from './client.ts'
import { createAccountApi } from './account.ts'
import { createFeedApi } from './feed.ts'
import { createVideoApi } from './video.ts'
import { createLikeApi } from './like.ts'
import { createSocialApi } from './social.ts'
import { createCommentApi } from './comment.ts'
import { createMessageApi } from './message.ts'
export function createBusinessApi(client: ApiClient) {
  return { account: createAccountApi(client), feed: createFeedApi(client), video: createVideoApi(client), like: createLikeApi(client), social: createSocialApi(client), comment: createCommentApi(client), message: createMessageApi(client) }
}
