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
  const auth = useAuth();
  const { baseUrl } = useRuntime();
  const profile = useAccount(auth.accountId);
  const [tab, setTab] = useState<"works" | "liked">("works");
  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="card bg-base-200">
        <div className="card-body gap-4">
          <UserAvatar
            username={profile.data?.username ?? auth.username}
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
              message="资料加载失败，当前显示登录身份"
              retry={() => void profile.refetch()}
            />
          )}
          {profile.data?.bio && (
            <p className="whitespace-pre-wrap break-words">{profile.data.bio}</p>
          )}
          <SocialSummary targetId={auth.accountId} />
          <Link to="/settings" className="btn btn-primary self-start">
            账号设置
          </Link>
        </div>
      </div>
      <div role="tablist" aria-label="我的视频" className="tabs tabs-border">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "works"}
          className={`tab ${tab === "works" ? "tab-active" : ""}`}
          onClick={() => setTab("works")}
        >
          作品
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "liked"}
          className={`tab ${tab === "liked" ? "tab-active" : ""}`}
          onClick={() => setTab("liked")}
        >
          喜欢
        </button>
      </div>
      <VideoList key={tab} authorId={auth.accountId} liked={tab === "liked"} />
    </section>
  );
}
