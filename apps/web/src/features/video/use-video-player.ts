import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptsVideoShortcut } from './keyboard'

export function useVideoPlayer(activeId?: number) {
  const videos = useRef(new Map<number, HTMLVideoElement>())
  const desired = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(true)
  const register = useCallback((id: number, element: HTMLVideoElement | null) => {
    const previous = videos.current.get(id)
    if (previous && previous !== element) previous.pause()
    if (element) videos.current.set(id, element)
    else videos.current.delete(id)
  }, [])
  const play = useCallback(async (element: HTMLVideoElement) => {
    try {
      await element.play()
      if (desired.current !== element) element.pause()
      else setPaused(element.paused)
    } catch {
      if (desired.current === element) setPaused(true)
    }
  }, [])
  useEffect(() => {
    const elements = videos.current
    const active = activeId === undefined ? undefined : elements.get(activeId)
    elements.forEach(element => element.pause())
    desired.current = active ?? null
    if (active) void play(active)
    return () => { desired.current = null; elements.forEach(element => element.pause()) }
  }, [activeId, play])
  useEffect(() => { videos.current.forEach(element => { element.muted = muted }) }, [muted])
  const togglePlay = useCallback(() => {
    const element = desired.current
    if (!element) return
    if (element.paused) void play(element)
    else { element.pause(); setPaused(true) }
  }, [play])
  const toggleMute = useCallback(() => setMuted(value => !value), [])
  const onPlaybackChange = useCallback((element: HTMLVideoElement) => {
    if (element === desired.current) setPaused(element.paused)
  }, [])
  return { register, muted, paused, togglePlay, toggleMute, onPlaybackChange }
}
export type VideoPlayer = ReturnType<typeof useVideoPlayer>

export function useVideoShortcuts({ player, move, comments }: { player: VideoPlayer; move?: (delta: number) => void; comments?: () => void }) {
  const { togglePlay, toggleMute } = player
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (!acceptsVideoShortcut(event, { tagName: target?.tagName, isContentEditable: target?.isContentEditable, insideEditor: !!target?.closest('[contenteditable], input, textarea, select'), insideButton: !!target?.closest('button, [role="button"]') }, !!document.querySelector('dialog[open]'))) return
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { if (!move) return; move(event.key === 'ArrowUp' ? -1 : 1) }
      else if (event.key === ' ') togglePlay()
      else if (event.key.toLowerCase() === 'm') toggleMute()
      else if (event.key.toLowerCase() === 'c') { if (!comments) return; comments() }
      event.preventDefault()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [togglePlay, toggleMute, move, comments])
}
