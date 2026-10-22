type Viewer = { sessionId: number; accountId: number }
export const queryKeys = {
  feed: ({ sessionId, accountId }: Viewer, kind: 'latest' | 'likesCount' | 'popularity' | 'following', limit: number) => ['feed', sessionId, accountId, kind, limit] as const,
  video: ({ sessionId, accountId }: Viewer, id: number) => ['video', sessionId, accountId, id] as const,
  liked: ({ sessionId, accountId }: Viewer, id: number) => ['liked', sessionId, accountId, id] as const,
  followers: ({ sessionId, accountId }: Viewer, targetId: number) => ['followers', sessionId, accountId, targetId] as const,
  followings: ({ sessionId, accountId }: Viewer, targetId: number) => ['followings', sessionId, accountId, targetId] as const,
  comments: ({ sessionId, accountId }: Viewer, videoId: number) => ['comments', sessionId, accountId, videoId] as const,
}
