import { useEffect, useId, useRef } from "react";
export function ConfirmDialog({
  open,
  title,
  description,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={id}
      aria-describedby={id + "-description"}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open && !busy && !dialog.current?.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-box space-y-4">
        <h2 id={id} className="text-xl font-bold">
          {title}
        </h2>
        <p id={id + "-description"}>{description}</p>
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
            autoFocus
          >
            取消
          </button>
          <button type="button" className="btn btn-error" disabled={busy} onClick={onConfirm}>
            {busy ? "处理中…" : "确认"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
