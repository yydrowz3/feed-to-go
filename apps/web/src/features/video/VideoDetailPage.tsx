import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useAuth, useRuntime } from '../../lib/app-context'
import { parseResourceId } from '../../lib/navigation'
import { queryKeys } from '../../lib/query-keys'
import { LoadingState } from '../../components/LoadingState'
import { ErrorState } from '../../components/ErrorState'
import { FeedSlide } from '../feed/FeedSlide'
import { useVideoPlayer, useVideoShortcuts } from './use-video-player'
import { useLikedVideo } from './queries'
import type { Video } from '../../api/types'
export function VideoDetailPage() {
  const { id } = useParams({ from: '/video/$id' })
  return <VideoDetail key={id} id={parseResourceId(id)} />
}
function VideoDetail({ id }: { id: number }) {
  const { services } = useRuntime()
  const auth = useAuth()
  const query = useQuery({ queryKey: queryKeys.video(auth, id), queryFn: ({ signal }) => services.video.getDetail(id, signal) })
  if (query.isPending) return <LoadingState />
  if (query.isError && !query.data) return <ErrorState message={query.error.message} retry={() => void query.refetch()} />
  return query.data && <DetailPlayer key={`${auth.sessionId}:${id}`} video={query.data} />
}
function DetailPlayer({ video }: { video: Video }) {
  const auth = useAuth()
  const liked = useLikedVideo(video.id)
  const player = useVideoPlayer(video.id)
  useVideoShortcuts({ player })
  const item = { ...video, author: { id: video.author_id, username: video.username }, create_time: new Date(video.create_time).getTime() / 1000, is_liked: liked.data?.is_liked ?? false }
  return <div className="min-h-0 flex-1"><FeedSlide item={item} mounted active player={player} detail likeReady={!auth.accessToken || !!liked.data} />{liked.isError && <p role="alert" className="absolute right-4 top-24 rounded-box bg-base-200 p-3">点赞状态加载失败 <button className="btn btn-xs" onClick={() => void liked.refetch()}>重试</button></p>}</div>
}
