import { Link } from '@tanstack/react-router'
import type { FeedVideoItem } from '../../api/types'
import { useRuntime } from '../../lib/app-context'
import { mediaUrl } from '../../lib/media-url'
import { ShareButton } from './ShareButton'
import { LikeButton } from './LikeButton'
export function VideoCard({ item }: { item: FeedVideoItem }) {
  const { baseUrl } = useRuntime()
  return <article className="card min-w-0 flex-1 bg-base-200 sm:card-side">
    <Link to="/video/$id" params={{ id: String(item.id) }} className="block shrink-0 sm:w-48"><img src={mediaUrl(item.cover_url, baseUrl)} alt={item.title} loading="lazy" className="aspect-video w-full object-cover sm:h-full" /></Link>
    <div className="card-body min-w-0 gap-3 p-4">
      <Link to="/video/$id" params={{ id: String(item.id) }} className="card-title break-words">{item.title}</Link>
      <Link to="/u/$id" params={{ id: String(item.author.id) }} className="link link-hover">@{item.author.username}</Link>
      <time dateTime={new Date(item.create_time * 1000).toISOString()} className="text-xs text-base-content/60">{new Date(item.create_time * 1000).toLocaleString()}</time>
      <div className="card-actions items-center"><LikeButton videoId={item.id} liked={item.is_liked} count={item.likes_count} /><ShareButton videoId={item.id} /></div>
    </div>
  </article>
}
