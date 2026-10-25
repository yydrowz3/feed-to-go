import { useAppTranslation } from "../../i18n/react";
import type { FeedKind } from "./pagination";
export function FeedTabs({
  value,
  onChange,
}: {
  value: FeedKind;
  onChange: (kind: FeedKind) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("feed.tabs")}
      className="tabs tabs-border shrink-0 justify-center bg-base-200"
    >
      {(
        [
          ["latest", t("navigation.home")],
          ["following", t("social.following")],
          ["likesCount", t("feed.mostLiked")],
        ] as const
      ).map(([kind, label]) => (
        <button
          key={kind}
          role="tab"
          aria-selected={value === kind}
          className={`tab ${value === kind ? "tab-active" : ""}`}
          onClick={() => onChange(kind)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
