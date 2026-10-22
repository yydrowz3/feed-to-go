export function LoadingState({ label = "加载中…" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-40 items-center justify-center gap-3">
      <span className="loading loading-spinner text-primary" />
      {label}
    </div>
  );
}
