type Viewer = { sessionId: number; accountId: number }
export const queryKeys = {
  feed: ({ sessionId, accountId }: Viewer, kind: 'latest' | 'likesCount' | 'popularity' | 'following', limit: number) => ['feed', sessionId, accountId, kind, limit] as const,
  video: ({ sessionId, accountId }: Viewer, id: number) => ['video', sessionId, accountId, id] as const,
  liked: ({ sessionId, accountId }: Viewer, id: number) => ['liked', sessionId, accountId, id] as const,
  followers: ({ sessionId, accountId }: Viewer, targetId: number) => ['followers', sessionId, accountId, targetId] as const,
  followings: ({ sessionId, accountId }: Viewer, targetId: number) => ['followings', sessionId, accountId, targetId] as const,
  comments: ({ sessionId, accountId }: Viewer, videoId: number) => ['comments', sessionId, accountId, videoId] as const,
  likedVideos: ({ sessionId, accountId }: Viewer) => ['likedVideos', sessionId, accountId] as const,
  authorVideos: ({ sessionId, accountId }: Viewer, authorId: number) => ['authorVideos', sessionId, accountId, authorId] as const,
  profile: ({ sessionId, accountId }: Viewer, targetId: number) => ['profile', sessionId, accountId, targetId] as const,
  socialCounts: ({ sessionId, accountId }: Viewer, targetId: number) => ['socialCounts', sessionId, accountId, targetId] as const,
  contacts: ({ sessionId, accountId }: Viewer) => ['contacts', sessionId, accountId] as const,
}
