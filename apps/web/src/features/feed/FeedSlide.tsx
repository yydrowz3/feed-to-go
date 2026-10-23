import { Link } from '@tanstack/react-router'
import type { FeedVideoItem } from '../../api/types'
import { useRuntime } from '../../lib/app-context'
import { mediaUrl } from '../../lib/media-url'
export function FeedSlide({ item }: { item: FeedVideoItem }) {
  const { baseUrl } = useRuntime()
  return <section className="relative flex h-full shrink-0 snap-start items-center justify-center bg-black">
    <img src={mediaUrl(item.cover_url, baseUrl)} alt="" className="h-full w-full object-contain" />
    <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black to-transparent p-6 pt-20 text-white">
      <Link to="/u/$id" params={{ id: String(item.author.id) }} className="font-bold">@{item.author.username}</Link>
      <h2 className="text-xl font-bold">{item.title}</h2>
      <Link to="/video/$id" params={{ id: String(item.id) }} className="btn btn-sm">查看详情</Link>
    </div>
  </section>
}
