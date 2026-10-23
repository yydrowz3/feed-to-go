export function AccountIdentity({ username, accountId }: { username: string; accountId: number }) {
  return (
    <div className="space-y-2">
      <h1 className="break-words text-2xl font-bold">{username}</h1>
      <p>账号 #{accountId}</p>
    </div>
  );
}
