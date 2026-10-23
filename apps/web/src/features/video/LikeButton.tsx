import { Heart } from 'lucide-react'
import { useLikeAction } from '../social/use-social-actions'
export function LikeButton({ videoId, liked, count, ready = true }: { videoId: number; liked: boolean; count: number; ready?: boolean }) {
  const action = useLikeAction(videoId, liked, ready)
  return <button type="button" className={`btn btn-sm ${liked ? 'btn-secondary' : ''}`} aria-pressed={liked} aria-label={liked ? '取消点赞' : '点赞'} disabled={action.disabled} onClick={action.toggle}><Heart size={16} fill={liked ? 'currentColor' : 'none'} />{count}</button>
}
