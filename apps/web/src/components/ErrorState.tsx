import { Link } from "@tanstack/react-router";
export function ErrorState({
  message = "页面加载失败，请稍后重试",
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <section
      role="alert"
      className="m-auto flex max-w-xl flex-col items-center gap-4 p-6 text-center"
    >
      <h1 className="text-xl font-bold">出现问题</h1>
      <p className="break-words">{message}</p>
      <div className="flex gap-3">
        {retry && (
          <button type="button" className="btn btn-primary" onClick={retry}>
            重试
          </button>
        )}
        <Link to="/" className="btn btn-ghost">
          返回首页
        </Link>
      </div>
    </section>
  );
}
