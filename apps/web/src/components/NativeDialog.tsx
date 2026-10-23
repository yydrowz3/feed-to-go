import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
export function NativeDialog({ open, title, onClose, children, drawer = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = ref.current
    if (!open || !element) return
    const previous = document.activeElement
    element.showModal()
    element.querySelector<HTMLElement>('[data-dialog-focus]')?.focus()
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [open])
  return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${drawer ? 'modal-bottom md:modal-end' : ''}`} onCancel={event => { event.preventDefault(); onClose() }} onClose={() => { if (open && !ref.current?.open) onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={`modal-box flex flex-col gap-4 ${drawer ? 'max-h-[85dvh] w-full md:h-dvh md:max-h-dvh md:max-w-lg md:rounded-none' : ''}`}>
      <div className="flex items-center justify-between gap-4"><h2 id={titleId} tabIndex={-1} data-dialog-focus className="min-w-0 break-words text-xl font-bold">{title}</h2><button type="button" className="btn btn-circle btn-ghost btn-sm shrink-0" aria-label="关闭" onClick={onClose}><X size={18} /></button></div>
      {children}
    </div>
  </dialog>
}
