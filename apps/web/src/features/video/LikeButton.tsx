import { useAppTranslation } from "../../i18n/react";
import { Heart } from "lucide-react";
import { useLikeAction } from "../social/use-social-actions";
export function LikeButton({
  videoId,
  liked,
  count,
  ready = true,
}: {
  videoId: number;
  liked: boolean;
  count: number;
  ready?: boolean;
}) {
  const { t, number } = useAppTranslation();
  const action = useLikeAction(videoId, liked, ready);
  return (
    <button
      type="button"
      className={`btn btn-sm ${liked ? "btn-secondary" : ""}`}
      aria-pressed={liked}
      aria-label={liked ? t("video.unlike") : t("video.like")}
      disabled={action.disabled}
      onClick={action.toggle}
    >
      <Heart size={16} fill={liked ? "currentColor" : "none"} />
      {number(count)}
    </button>
  );
}
