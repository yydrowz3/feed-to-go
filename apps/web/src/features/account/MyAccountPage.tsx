import { useAppTranslation } from "../../i18n/react";
import { Link } from "@tanstack/react-router";
import { useAuth, useRuntime } from "../../lib/app-context";
import { mediaUrl } from "../../lib/media-url";
import { UserAvatar } from "../../components/UserAvatar";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { AccountIdentity } from "./AccountIdentity";
import { useAccount } from "./queries";
import { SocialSummary } from "../social/SocialSummary";
import { useState } from "react";
import { VideoList } from "./VideoLists";

export function MyAccountPage() {
  const { t } = useAppTranslation();
  const auth = useAuth();
  const { baseUrl } = useRuntime();
  const profile = useAccount(auth.accountId);
  const [tab, setTab] = useState<"works" | "liked">("works");
  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="card bg-base-200">
        <div className="card-body gap-4">
          <UserAvatar
            username={profile.data?.username || auth.username || t("common.anonymous")}
            src={mediaUrl(profile.data?.avatar_url, baseUrl)}
            size="lg"
          />
          <AccountIdentity
            username={profile.data?.username ?? auth.username}
            accountId={auth.accountId}
          />
          {profile.isPending && <LoadingState />}
          {profile.isError && (
            <ErrorState
              message={profile.error}
              fallback="errors.profileFallback"
              retry={() => void profile.refetch()}
            />
          )}
          {profile.data?.bio && (
            <p className="whitespace-pre-wrap break-words">{profile.data.bio}</p>
          )}
          <SocialSummary targetId={auth.accountId} />
          <Link to="/settings" className="btn btn-primary self-start">
            {t("account.settings")}
          </Link>
        </div>
      </div>
      <div role="tablist" aria-label={t("account.myVideos")} className="tabs tabs-border">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "works"}
          className={`tab ${tab === "works" ? "tab-active" : ""}`}
          onClick={() => setTab("works")}
        >
          {t("account.videos")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "liked"}
          className={`tab ${tab === "liked" ? "tab-active" : ""}`}
          onClick={() => setTab("liked")}
        >
          {t("account.likes")}
        </button>
      </div>
      <VideoList key={tab} authorId={auth.accountId} liked={tab === "liked"} />
    </section>
  );
}
