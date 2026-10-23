import { Link } from "@tanstack/react-router";
import { useAuth, useRuntime } from "../../lib/app-context";
import { mediaUrl } from "../../lib/media-url";
import { useSocialLists } from "../account/queries";
import { mergeContacts } from "./contacts";
import { UserAvatar } from "../../components/UserAvatar";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";

export function MessagesPage() {
  const auth = useAuth();
  const { baseUrl } = useRuntime();
  const { followers, followings } = useSocialLists(auth.accountId);
  const contacts = mergeContacts(
    auth.accountId,
    followings.data?.followings,
    followers.data?.followers,
  );
  return (
    <section className="mx-auto grid w-full max-w-2xl gap-5">
      <h1 className="text-2xl font-bold">私信联系人</h1>
      <p className="text-base-content/60">从关注和粉丝中选择联系人。</p>
      {(followers.isPending || followings.isPending) && <LoadingState label="加载联系人…" />}
      {followings.isError && (
        <ErrorState
          message="关注联系人加载失败，仍可使用已加载的粉丝联系人"
          retry={() => void followings.refetch()}
        />
      )}
      {followers.isError && (
        <ErrorState
          message="粉丝联系人加载失败，仍可使用已加载的关注联系人"
          retry={() => void followers.refetch()}
        />
      )}
      {followers.isSuccess && followings.isSuccess && !contacts.length && (
        <EmptyState title="暂无联系人">关注用户或前往用户主页发起私信。</EmptyState>
      )}
      <ul className="grid gap-3">
        {contacts.map((account) => (
          <li key={account.id}>
            <Link
              to="/messages/$peerId"
              params={{ peerId: String(account.id) }}
              className="flex items-center gap-4 rounded-box bg-base-200 p-4 hover:bg-base-300"
            >
              <UserAvatar username={account.username} src={mediaUrl(account.avatar_url, baseUrl)} />
              <span className="min-w-0 break-words">{account.username}</span>
              <span className="ml-auto shrink-0 text-sm text-base-content/60">发私信</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
