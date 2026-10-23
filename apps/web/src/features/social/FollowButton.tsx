import type { Account } from '../../api/types'
import { useFollowAction } from './use-social-actions'
export function FollowButton({ author }: { author: Account }) {
  const action = useFollowAction(author)
  if (action.hidden) return null
  if (action.query.isError && !action.query.data) return <button type="button" className="btn btn-sm" onClick={() => void action.query.refetch()}>重试关注状态</button>
  return <button type="button" className="btn btn-sm" aria-pressed={action.following} disabled={action.disabled} onClick={action.toggle}>{action.busy ? '处理中…' : action.following ? '已关注' : '关注'}</button>
}
