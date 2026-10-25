import { useAppTranslation } from "../../i18n/react";
import type { Account } from "../../api/types";
import { useFollowAction } from "./use-social-actions";
export function FollowButton({ author }: { author: Account }) {
  const { t } = useAppTranslation();
  const action = useFollowAction(author);
  if (action.hidden) return null;
  if (action.query.isError && !action.query.data)
    return (
      <button type="button" className="btn btn-sm" onClick={() => void action.query.refetch()}>
        {t("social.retryFollow")}
      </button>
    );
  return (
    <button
      type="button"
      className="btn btn-sm"
      aria-pressed={action.following}
      disabled={action.disabled}
      onClick={action.toggle}
    >
      {action.busy
        ? t("common.processing")
        : action.following
          ? t("social.following")
          : t("social.follow")}
    </button>
  );
}
