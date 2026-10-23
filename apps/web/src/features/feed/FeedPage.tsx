import { useEffect, useRef, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useAuth } from '../../lib/app-context'
import { LoadingState } from '../../components/LoadingState'
import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { useFeedQuery, paginationBroken } from './queries'
import { filterVideos, shouldPrefetch, uniqueVideos } from './pagination'
import type { FeedKind } from './pagination'
import { FeedTabs } from './FeedTabs'
import { FeedSlide } from './FeedSlide'

export function FeedPage() {
  const auth = useAuth()
  const [tab, setTab] = useState<FeedKind>('latest')
  const { q = '' } = useSearch({ from: '/' })
  return <div className="flex min-h-0 flex-1 flex-col">
    <FeedTabs value={tab} onChange={setTab} />
    {tab === 'following' && !auth.accessToken ? <EmptyState title="登录后查看关注的视频"><Link to="/account" search={{ redirect: '/' }} className="btn btn-primary">去登录</Link></EmptyState>
      : <FeedContent key={`${auth.sessionId}:${tab}:${q}`} kind={tab} search={q} />}
  </div>
}
function FeedContent({ kind, search }: { kind: FeedKind; search: string }) {
  const query = useFeedQuery(kind)
  const scroller = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const items = uniqueVideos(query.data?.pages ?? [])
  const filtered = filterVideos(items, search)
  const index = Math.min(activeIndex, Math.max(0, filtered.length - 1))
  const broken = paginationBroken(kind, query.data?.pages.at(-1), query.data?.pageParams.at(-1)) || !!(query.data?.pages.at(-1)?.has_more && !query.hasNextPage)
  const { hasNextPage, isFetching, isError, fetchNextPage } = query
  useEffect(() => {
    if (shouldPrefetch(search, index, items.length, !!hasNextPage, isFetching, isError)) void fetchNextPage()
  }, [search, index, items.length, hasNextPage, isFetching, isError, fetchNextPage])
  if (query.isPending) return <LoadingState />
  if (query.isError && !query.data) return <ErrorState message={query.error.message} retry={() => void query.refetch()} />
  return <>
    {!filtered.length && <EmptyState title={items.length ? '没有匹配内容' : '暂无视频'} />}
    {!!filtered.length && <div ref={scroller} className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto" onScroll={() => {
      const element = scroller.current
      if (element) setActiveIndex(Math.min(filtered.length - 1, Math.round(element.scrollTop / element.clientHeight)))
    }}>{filtered.map(item => <FeedSlide key={item.id} item={item} />)}</div>}
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-base-200 p-2 text-sm" aria-live="polite">
      {query.isError && <span role="alert">{query.error.message}</span>}
      {broken && <span role="alert">分页游标异常，请刷新视频流。</span>}
      <button className="btn btn-ghost btn-xs" disabled={query.isFetching} onClick={() => { if (scroller.current) scroller.current.scrollTop = 0; setActiveIndex(0); void query.restart() }}>刷新</button>
      {query.hasNextPage ? <button className="btn btn-sm" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? '加载中…' : query.isError ? '重试加载更多' : '加载更多视频'}</button> : !broken && !!items.length && <span>已到底</span>}
    </div>
  </>
}
