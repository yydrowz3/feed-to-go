export function ConfigError({ message }: { message: string }) {
  return (
    <main
      className="grid min-h-dvh place-items-center bg-base-300 p-6 font-sans text-base-content"
      data-theme="night"
    >
      <section className="alert alert-error max-w-xl" role="alert">
        <div>
          <h1 className="text-lg font-bold">应用配置错误</h1>
          <p>{message}</p>
          <p>请配置 .env.local 后重新启动应用。</p>
        </div>
      </section>
    </main>
  );
}
