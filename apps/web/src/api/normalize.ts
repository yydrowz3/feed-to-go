import type { Account, Comment, FeedVideoItem, Video } from './types.ts'
export function listOrEmpty<T>(value: T[] | null | undefined): T[] { return Array.isArray(value) ? value : [] }
export function normalizeAccount(value: Account | null | undefined): Account {
  return { ...value, id: Number(value?.id ?? 0), username: value?.username || '匿名用户', avatar_url: value?.avatar_url, bio: value?.bio }
}
export function normalizeFeedVideoItem(value: FeedVideoItem): FeedVideoItem {
  return { ...value, author: { id: Number(value.author?.id ?? 0), username: value.author?.username || '匿名用户' },
    title: value.title || '未命名视频', description: value.description || '', play_url: value.play_url || '', cover_url: value.cover_url || '',
    create_time: Number(value.create_time ?? 0), likes_count: Number(value.likes_count ?? 0), is_liked: Boolean(value.is_liked) }
}
export function normalizeFeedVideoList(value: FeedVideoItem[] | null | undefined): FeedVideoItem[] { return listOrEmpty(value).map(normalizeFeedVideoItem) }
export function normalizeVideo(value: Video): Video {
  return { ...value, username: value.username || '匿名用户', title: value.title || '未命名视频', description: value.description || '',
    play_url: value.play_url || '', cover_url: value.cover_url || '', likes_count: Number(value.likes_count ?? 0) }
}
export function normalizeVideoList(value: Video[] | null | undefined): Video[] { return listOrEmpty(value).map(normalizeVideo) }
export function normalizeCommentList(value: Comment[] | null | undefined): Comment[] {
  return listOrEmpty(value).map(comment => ({ ...comment, username: comment.username || '匿名用户', content: comment.content || '' }))
}
