import { useAppTranslation } from "../../i18n/react";
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
  const { t } = useAppTranslation();
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
      <h1 className="text-2xl font-bold">{t("messages.contacts")}</h1>
      <p className="text-base-content/60">{t("messages.contactsHelp")}</p>
      {(followers.isPending || followings.isPending) && (
        <LoadingState label={t("messages.loadingContacts")} />
      )}
      {followings.isError && (
        <ErrorState
          message={t("errors.followingContacts")}
          retry={() => void followings.refetch()}
        />
      )}
      {followers.isError && (
        <ErrorState message={t("errors.followerContacts")} retry={() => void followers.refetch()} />
      )}
      {followers.isSuccess && followings.isSuccess && !contacts.length && (
        <EmptyState title={t("messages.noContacts")}>{t("messages.noContactsHelp")}</EmptyState>
      )}
      <ul className="grid gap-3">
        {contacts.map((account) => (
          <li key={account.id}>
            <Link
              to="/messages/$peerId"
              params={{ peerId: String(account.id) }}
              className="flex items-center gap-4 rounded-box bg-base-200 p-4 hover:bg-base-300"
            >
              <UserAvatar
                username={account.username || t("common.anonymous")}
                src={mediaUrl(account.avatar_url, baseUrl)}
              />
              <span className="min-w-0 break-words">
                {account.username || t("common.anonymous")}
              </span>
              <span className="ml-auto shrink-0 text-sm text-base-content/60">
                {t("messages.startMessage")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
