import { useState } from "react";
import { useAuth } from "../../lib/app-context";
import { useRequireLogin } from "./use-social-actions";
import { useSocialLists } from "../account/queries";
import { FollowListDialog } from "./FollowListDialog";
import { ErrorState } from "../../components/ErrorState";

export function SocialSummary({ targetId }: { targetId: number }) {
  const auth = useAuth();
  const needLogin = useRequireLogin();
  const { followers, followings } = useSocialLists(targetId);
  const [kind, setKind] = useState<"followers" | "followings" | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (!needLogin()) setKind("followers");
          }}
        >
          粉丝 {auth.accessToken ? (followers.data?.follower_count ?? "—") : "登录查看"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (!needLogin()) setKind("followings");
          }}
        >
          关注 {auth.accessToken ? (followings.data?.followings_count ?? "—") : "登录查看"}
        </button>
      </div>
      {(followers.isError || followings.isError) && (
        <ErrorState
          message="社交资料加载失败"
          retry={() => {
            if (followers.isError) void followers.refetch();
            if (followings.isError) void followings.refetch();
          }}
        />
      )}
      {kind && auth.accessToken && (
        <FollowListDialog targetId={targetId} kind={kind} close={() => setKind(null)} />
      )}
    </div>
  );
}
