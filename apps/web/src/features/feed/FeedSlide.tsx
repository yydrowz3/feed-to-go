import { Link } from '@tanstack/react-router'
import type { FeedVideoItem } from '../../api/types'
import { useRuntime } from '../../lib/app-context'
import { mediaUrl } from '../../lib/media-url'
import { useCallback } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import type { VideoPlayer } from '../video/use-video-player'
import { ShareButton } from '../video/ShareButton'
export function FeedSlide({ item, mounted, active, player, onLike, detail = false }: { item: FeedVideoItem; mounted: boolean; active: boolean; player: VideoPlayer; onLike?: () => void; detail?: boolean }) {
  const { baseUrl } = useRuntime()
  const { register } = player
  const videoRef = useCallback((element: HTMLVideoElement | null) => register(item.id, element), [item.id, register])
  return <section className="relative flex h-full shrink-0 snap-start items-center justify-center bg-black">
    {mounted ? <video ref={videoRef} src={mediaUrl(item.play_url, baseUrl)} poster={mediaUrl(item.cover_url, baseUrl)} muted={player.muted} loop playsInline preload="metadata" className="h-full w-full object-contain" onClick={player.togglePlay} onDoubleClick={event => { event.preventDefault(); onLike?.() }} onPlay={event => player.onPlaybackChange(event.currentTarget)} onPause={event => player.onPlaybackChange(event.currentTarget)} /> : <img src={mediaUrl(item.cover_url, baseUrl)} alt="" loading="lazy" className="h-full w-full object-contain" />}
    {active && player.paused && <button className="btn btn-circle btn-lg absolute top-1/2" aria-label="点击播放" onClick={player.togglePlay}><Play /></button>}
    <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black to-transparent p-6 pt-20 text-white">
      <Link to="/u/$id" params={{ id: String(item.author.id) }} className="font-bold">@{item.author.username}</Link>
      <h2 className="text-xl font-bold">{item.title}</h2>
      {detail && <p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-sm">{item.description}</p>}
      <div className="flex gap-2" onClick={event => event.stopPropagation()}>
        <button className="btn btn-circle btn-sm" aria-label={player.paused ? '播放' : '暂停'} disabled={!active} onClick={player.togglePlay}>{player.paused ? <Play size={16} /> : <Pause size={16} />}</button>
        <button className="btn btn-circle btn-sm" aria-label={player.muted ? '取消静音' : '静音'} onClick={player.toggleMute}>{player.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        {!detail && <Link to="/video/$id" params={{ id: String(item.id) }} className="btn btn-sm">查看详情</Link>}
        <ShareButton videoId={item.id} />
      </div>
    </div>
  </section>
}
