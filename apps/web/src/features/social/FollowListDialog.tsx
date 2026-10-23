import { Link } from "@tanstack/react-router";
import { NativeDialog } from "../../components/NativeDialog";
import { UserAvatar } from "../../components/UserAvatar";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useRuntime } from "../../lib/app-context";
import { mediaUrl } from "../../lib/media-url";
import { useSocialLists } from "../account/queries";

export function FollowListDialog({
  targetId,
  kind,
  close,
}: {
  targetId: number;
  kind: "followers" | "followings";
  close: () => void;
}) {
  const { baseUrl } = useRuntime();
  const { followers, followings } = useSocialLists(targetId);
  const query = kind === "followers" ? followers : followings;
  const accounts = kind === "followers" ? followers.data?.followers : followings.data?.followings;
  return (
    <NativeDialog open title={kind === "followers" ? "粉丝" : "关注"} onClose={close} drawer>
      <div className="min-h-0 overflow-y-auto">
        {query.isPending && <LoadingState />}
        {query.isError && (
          <ErrorState message="用户列表加载失败" retry={() => void query.refetch()} />
        )}
        {query.isSuccess && accounts && !accounts.length && <EmptyState title="暂无用户" />}
        <ul className="grid gap-2">
          {accounts?.map((account) => (
            <li key={account.id}>
              <Link
                to="/u/$id"
                params={{ id: String(account.id) }}
                onClick={close}
                className="flex items-center gap-3 rounded-box p-3 hover:bg-base-300"
              >
                <UserAvatar
                  username={account.username}
                  src={mediaUrl(account.avatar_url, baseUrl)}
                />
                <span className="min-w-0 break-words">{account.username}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </NativeDialog>
  );
}
