import type { FeedVideoItem, LatestInput, LikesCountInput, PopularityInput, ListLatestResponse, ListLikesCountResponse, ListByPopularityResponse } from '../../api/types.ts'

export type FeedKind = 'latest' | 'following' | 'likesCount' | 'popularity'
export type FeedCursor = LatestInput | LikesCountInput | PopularityInput
export type FeedPageData = ListLatestResponse | ListLikesCountResponse | ListByPopularityResponse
export function initialCursor(kind: FeedKind, limit = 10): FeedCursor {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('每页数量须为 1～50 的整数')
  if (kind === 'popularity') return { limit, as_of: 0, offset: 0 }
  if (kind === 'likesCount') return { limit }
  return { limit, latest_time: 0 }
}
export function nextCursor(kind: FeedKind, page: FeedPageData, previous: FeedCursor): FeedCursor | undefined {
  if (!page.has_more || !page.video_list.length) return undefined
  let next: FeedCursor
  const limit = previous.limit
  if (kind === 'latest' || kind === 'following') {
    if (!('next_time' in page) || !Number.isFinite(page.next_time)) return undefined
    next = { limit, latest_time: page.next_time }
  } else if (kind === 'likesCount') {
    if (!('next_id_before' in page) || !Number.isSafeInteger(page.next_id_before) || !Number.isFinite(page.next_likes_count_before)) return undefined
    next = { limit, likes_count_before: page.next_likes_count_before, id_before: page.next_id_before }
  } else {
    if (!('as_of' in page) || !Number.isFinite(page.as_of) || !Number.isInteger(page.next_offset)) return undefined
    const fallback = [page.next_latest_popularity, page.next_latest_before, page.next_latest_id_before]
    if (fallback.some(value => value !== undefined) && !(Number.isFinite(fallback[0]) && typeof fallback[1] === 'string' && fallback[1].length && Number.isSafeInteger(fallback[2]))) return undefined
    next = { limit, as_of: page.as_of, offset: page.next_offset,
      ...(fallback.every(value => value !== undefined) ? { latest_popularity: page.next_latest_popularity, latest_before: page.next_latest_before, latest_id_before: page.next_latest_id_before } : {}) }
  }
  return JSON.stringify(next) === JSON.stringify(previous) ? undefined : next
}
export function uniqueVideos(pages: FeedPageData[]): FeedVideoItem[] {
  const seen = new Set<number>()
  return pages.flatMap(page => page.video_list).filter(item => !seen.has(item.id) && !!seen.add(item.id))
}
export function filterVideos(items: FeedVideoItem[], search: string) {
  const q = search.trim().toLowerCase()
  return q ? items.filter(item => item.title.trim().toLowerCase().includes(q) || item.author.username.trim().toLowerCase().includes(q)) : items
}
export function shouldPrefetch(search: string, index: number, length: number, hasNext: boolean, fetching: boolean, failed: boolean) {
  return !search.trim() && length > 0 && length - index - 1 < 3 && hasNext && !fetching && !failed
}
