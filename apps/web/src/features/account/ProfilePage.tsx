import { useAppTranslation } from "../../i18n/react";
import { Link, useParams } from "@tanstack/react-router";
import { useAuth, useRuntime } from "../../lib/app-context";
import { parseResourceId } from "../../lib/navigation";
import { mediaUrl } from "../../lib/media-url";
import { UserAvatar } from "../../components/UserAvatar";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { SocialSummary } from "../social/SocialSummary";
import { FollowButton } from "../social/FollowButton";
import { useAccount } from "./queries";
import { VideoList } from "./VideoLists";

export function ProfilePage() {
  const { id } = useParams({ from: "/u/$id" });
  const auth = useAuth();
  return <ProfileContent key={`${id}:${auth.sessionId}`} id={parseResourceId(id)} />;
}
function ProfileContent({ id }: { id: number }) {
  const { t } = useAppTranslation();
  const auth = useAuth();
  const { baseUrl } = useRuntime();
  const profile = useAccount(id);
  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="card bg-base-200">
        <div className="card-body gap-4">
          {profile.isPending && <LoadingState label={t("account.loadingUser")} />}
          {profile.isError && (
            <ErrorState
              message={profile.error}
              fallback="errors.profileLoad"
              retry={() => void profile.refetch()}
            />
          )}
          {profile.data && (
            <>
              <UserAvatar
                username={profile.data.username || t("common.anonymous")}
                src={mediaUrl(profile.data.avatar_url, baseUrl)}
                size="lg"
              />
              <h1 className="break-words text-2xl font-bold">
                {profile.data.username || t("common.anonymous")}
              </h1>
              <p className="text-sm text-base-content/60">ID: {id}</p>
              {profile.data.bio && (
                <p className="whitespace-pre-wrap break-words">{profile.data.bio}</p>
              )}
              <SocialSummary targetId={id} />
              {id !== auth.accountId && (
                <div className="flex flex-wrap gap-3">
                  <FollowButton author={profile.data} />
                  {auth.accessToken ? (
                    <Link to="/messages/$peerId" params={{ peerId: String(id) }} className="btn">
                      {t("navigation.messages")}
                    </Link>
                  ) : (
                    <Link to="/account" search={{ redirect: `/messages/${id}` }} className="btn">
                      {t("messages.signInToMessage")}
                    </Link>
                  )}
                </div>
              )}
              {id === auth.accountId && (
                <Link to="/account" className="btn self-start">
                  {t("account.manageAccount")}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
      <h2 className="text-xl font-bold">{t("account.videos")}</h2>
      <VideoList authorId={id} />
    </section>
  );
}
