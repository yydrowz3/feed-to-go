import { useAppTranslation } from "../../i18n/react";
import { useState } from "react";
import { useAuth } from "../../lib/app-context";
import { useRequireLogin } from "./use-social-actions";
import { useSocialLists } from "../account/queries";
import { FollowListDialog } from "./FollowListDialog";
import { ErrorState } from "../../components/ErrorState";

export function SocialSummary({ targetId }: { targetId: number }) {
  const { t, number } = useAppTranslation();
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
          {t("social.followers")}
          {auth.accessToken
            ? followers.data
              ? number(followers.data.follower_count)
              : "—"
            : t("social.signInToView")}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (!needLogin()) setKind("followings");
          }}
        >
          {t("social.following")}
          {auth.accessToken
            ? followings.data
              ? number(followings.data.followings_count)
              : "—"
            : t("social.signInToView")}
        </button>
      </div>
      {(followers.isError || followings.isError) && (
        <ErrorState
          message={followers.error ?? followings.error}
          fallback="errors.socialLoad"
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
