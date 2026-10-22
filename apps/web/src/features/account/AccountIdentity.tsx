export function AccountIdentity({ username, accountId }: { username: string; accountId: number }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">{username}</h1>
      <p>账号 #{accountId}</p>
      <p className="text-base-content/60">完整资料将在阶段 03 实现。</p>
    </div>
  );
}
