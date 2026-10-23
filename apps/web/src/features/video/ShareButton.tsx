import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { NativeDialog } from '../../components/NativeDialog'
export function ShareButton({ videoId }: { videoId: number }) {
  const [open, setOpen] = useState(false)
  const url = `${window.location.origin}/video/${videoId}`
  const share = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('链接已复制') }
    catch { setOpen(true) }
  }
  return <>
    <button type="button" className="btn btn-sm" onClick={() => void share()}><Share2 size={16} />分享</button>
    <NativeDialog open={open} title="复制视频链接" onClose={() => setOpen(false)}><input className="input w-full" aria-label="视频分享链接" value={url} readOnly onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} /></NativeDialog>
  </>
}
