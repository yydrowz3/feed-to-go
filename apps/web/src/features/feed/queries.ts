import { useInfiniteQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { useAuth, useRuntime } from '../../lib/app-context'
import { queryKeys } from '../../lib/query-keys'
import { initialCursor, nextCursor } from './pagination'
import type { FeedKind, FeedCursor, FeedPageData } from './pagination'
import type { LatestInput, LikesCountInput, PopularityInput } from '../../api/types'

export function useFeedQuery(kind: FeedKind, limit = 10, enabled = true) {
  const { services, queryClient } = useRuntime()
  const auth = useAuth()
  const query = useInfiniteQuery<FeedPageData, Error, InfiniteData<FeedPageData, FeedCursor>, ReturnType<typeof queryKeys.feed>, FeedCursor>({
    queryKey: queryKeys.feed(auth, kind, limit),
    enabled: enabled && (kind !== 'following' || !!auth.accessToken),
    initialPageParam: initialCursor(kind, limit),
    queryFn: ({ pageParam, signal }): Promise<FeedPageData> => {
      if (kind === 'latest') return services.feed.latest(pageParam as LatestInput, signal)
      if (kind === 'following') return services.feed.following(pageParam as LatestInput, signal)
      if (kind === 'likesCount') return services.feed.likesCount(pageParam as LikesCountInput, signal)
      return services.feed.popularity(pageParam as PopularityInput, signal)
    },
    getNextPageParam: (page, _pages, previous, parameters) => {
      const next = nextCursor(kind, page, previous)
      return next && !parameters.some(cursor => JSON.stringify(cursor) === JSON.stringify(next)) ? next : undefined
    },
  })
  return { ...query, restart: () => queryClient.resetQueries({ queryKey: queryKeys.feed(auth, kind, limit), exact: true }) }
}
export function paginationBroken(kind: FeedKind, page?: FeedPageData, previous?: FeedCursor) {
  return !!(page?.has_more && previous && !nextCursor(kind, page, previous))
}
