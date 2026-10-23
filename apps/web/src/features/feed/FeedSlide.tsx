import { Link } from '@tanstack/react-router'
import type { FeedVideoItem } from '../../api/types'
import { useRuntime } from '../../lib/app-context'
import { mediaUrl } from '../../lib/media-url'
import { useCallback } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import type { VideoPlayer } from '../video/use-video-player'
import { ShareButton } from '../video/ShareButton'
import { LikeButton } from '../video/LikeButton'
import { FollowButton } from '../social/FollowButton'
import { useLikeAction } from '../social/use-social-actions'
export function FeedSlide({ item, mounted, active, player, detail = false, likeReady = true }: { item: FeedVideoItem; mounted: boolean; active: boolean; player: VideoPlayer; detail?: boolean; likeReady?: boolean }) {
  const { baseUrl } = useRuntime()
  const { register } = player
  const like = useLikeAction(item.id, item.is_liked, likeReady)
  const videoRef = useCallback((element: HTMLVideoElement | null) => register(item.id, element), [item.id, register])
  return <section className="relative flex h-full shrink-0 snap-start items-center justify-center bg-black">
    {mounted ? <video ref={videoRef} src={mediaUrl(item.play_url, baseUrl)} poster={mediaUrl(item.cover_url, baseUrl)} muted={player.muted} loop playsInline preload="metadata" className="h-full w-full object-contain" onClick={player.togglePlay} onDoubleClick={event => { event.preventDefault(); like.toggle() }} onPlay={event => player.onPlaybackChange(event.currentTarget)} onPause={event => player.onPlaybackChange(event.currentTarget)} /> : <img src={mediaUrl(item.cover_url, baseUrl)} alt="" loading="lazy" className="h-full w-full object-contain" />}
    {active && player.paused && <button className="btn btn-circle btn-lg absolute top-1/2" aria-label="点击播放" onClick={player.togglePlay}><Play /></button>}
    <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black to-transparent p-6 pt-20 text-white">
      <Link to="/u/$id" params={{ id: String(item.author.id) }} className="font-bold">@{item.author.username}</Link>
      <h2 className="text-xl font-bold">{item.title}</h2>
      {detail && <p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-sm">{item.description}</p>}
      <div className="flex flex-wrap gap-2" onClick={event => event.stopPropagation()}>
        <button className="btn btn-circle btn-sm" aria-label={player.paused ? '播放' : '暂停'} disabled={!active} onClick={player.togglePlay}>{player.paused ? <Play size={16} /> : <Pause size={16} />}</button>
        <button className="btn btn-circle btn-sm" aria-label={player.muted ? '取消静音' : '静音'} onClick={player.toggleMute}>{player.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        {!detail && <Link to="/video/$id" params={{ id: String(item.id) }} className="btn btn-sm">查看详情</Link>}
        <ShareButton videoId={item.id} />
        <LikeButton videoId={item.id} liked={item.is_liked} count={item.likes_count} ready={likeReady} />
        <FollowButton author={item.author} />
      </div>
    </div>
  </section>
}
