import type { FeedKind } from './pagination'
export function FeedTabs({ value, onChange }: { value: FeedKind; onChange: (kind: FeedKind) => void }) {
  return <div role="tablist" aria-label="视频流" className="tabs tabs-border shrink-0 justify-center bg-base-200">
    {([['latest', '推荐'], ['following', '关注'], ['likesCount', '点赞榜']] as const).map(([kind, label]) =>
      <button key={kind} role="tab" aria-selected={value === kind} className={`tab ${value === kind ? 'tab-active' : ''}`} onClick={() => onChange(kind)}>{label}</button>)}
  </div>
}
