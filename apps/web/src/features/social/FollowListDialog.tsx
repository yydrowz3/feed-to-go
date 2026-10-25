import { useAppTranslation } from "../../i18n/react";
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
  const { t } = useAppTranslation();
  const { baseUrl } = useRuntime();
  const { followers, followings } = useSocialLists(targetId);
  const query = kind === "followers" ? followers : followings;
  const accounts = kind === "followers" ? followers.data?.followers : followings.data?.followings;
  return (
    <NativeDialog
      open
      title={kind === "followers" ? t("social.followers") : t("social.following")}
      onClose={close}
      drawer
    >
      <div className="min-h-0 overflow-y-auto">
        {query.isPending && <LoadingState />}
        {query.isError && (
          <ErrorState
            message={query.error}
            fallback="errors.usersLoad"
            retry={() => void query.refetch()}
          />
        )}
        {query.isSuccess && accounts && !accounts.length && (
          <EmptyState title={t("social.empty")} />
        )}
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
                  username={account.username || t("common.anonymous")}
                  src={mediaUrl(account.avatar_url, baseUrl)}
                />
                <span className="min-w-0 break-words">
                  {account.username || t("common.anonymous")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </NativeDialog>
  );
}
