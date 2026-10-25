import { useAppTranslation } from "../../i18n/react";
import { useEffect, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useAuth } from "../../lib/app-context";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useFeedQuery, paginationBroken } from "./queries";
import { filterVideos, shouldPrefetch, uniqueVideos } from "./pagination";
import type { FeedKind } from "./pagination";
import { FeedTabs } from "./FeedTabs";
import { FeedSlide } from "./FeedSlide";
import { useFeedScroll } from "./use-feed-scroll";
import { useVideoPlayer, useVideoShortcuts } from "../video/use-video-player";
import { CommentDrawer } from "../comments/CommentDrawer";

export function FeedPage() {
  const { t } = useAppTranslation();
  const auth = useAuth();
  const [tab, setTab] = useState<FeedKind>("latest");
  const { q = "" } = useSearch({ from: "/" });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FeedTabs value={tab} onChange={setTab} />
      {tab === "following" && !auth.accessToken ? (
        <EmptyState title={t("feed.signInFollowing")}>
          <Link to="/account" search={{ redirect: "/" }} className="btn btn-primary">
            {t("account.goSignIn")}
          </Link>
        </EmptyState>
      ) : (
        <FeedContent key={`${auth.sessionId}:${tab}:${q}`} kind={tab} search={q} />
      )}
    </div>
  );
}
function FeedContent({ kind, search }: { kind: FeedKind; search: string }) {
  const { t, message: displayMessage } = useAppTranslation();
  const query = useFeedQuery(kind);
  const items = uniqueVideos(query.data?.pages ?? []);
  const filtered = filterVideos(items, search);
  const { scroller, index, move, reset } = useFeedScroll(filtered.length);
  const [commentVideo, setCommentVideo] = useState<{ id: number; title: string } | null>(null);
  const player = useVideoPlayer(filtered[index]?.id);
  useVideoShortcuts({
    player,
    move,
    comments: () => {
      if (filtered[index]) setCommentVideo(filtered[index]);
    },
  });
  const broken =
    paginationBroken(kind, query.data?.pages.at(-1), query.data?.pageParams.at(-1)) ||
    !!(query.data?.pages.at(-1)?.has_more && !query.hasNextPage);
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  useEffect(() => {
    if (shouldPrefetch(search, index, items.length, !!hasNextPage, isFetching, isError))
      void fetchNextPage();
  }, [search, index, items.length, hasNextPage, isFetching, isError, fetchNextPage]);
  if (query.isPending) return <LoadingState />;
  if (query.isError && !query.data)
    return <ErrorState message={query.error} retry={() => void query.refetch()} />;
  return (
    <>
      {!filtered.length && (
        <EmptyState title={items.length ? t("feed.noMatches") : t("feed.noVideos")} />
      )}
      {!!filtered.length && (
        <div ref={scroller} className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto">
          {filtered.map((item, itemIndex) => (
            <FeedSlide
              key={item.id}
              item={item}
              mounted={Math.abs(itemIndex - index) <= 1}
              active={itemIndex === index}
              player={player}
              onComments={() => setCommentVideo({ id: item.id, title: item.title })}
            />
          ))}
        </div>
      )}
      <div
        className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-base-200 p-2 text-sm"
        aria-live="polite"
      >
        {query.isError && <span role="alert">{displayMessage(query.error)}</span>}
        {broken && <span role="alert">{t("errors.feedCursor")}</span>}
        <button
          className="btn btn-ghost btn-xs"
          disabled={query.isFetching}
          onClick={() => {
            reset();
            void query.restart();
          }}
        >
          {t("common.refresh")}
        </button>
        {query.hasNextPage ? (
          <button
            className="btn btn-sm"
            disabled={query.isFetching}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage
              ? t("common.loading")
              : query.isError
                ? t("feed.retryMore")
                : t("feed.loadMoreVideos")}
          </button>
        ) : (
          !broken && !!items.length && <span>{t("feed.end")}</span>
        )}
      </div>
      <CommentDrawer
        videoId={commentVideo?.id ?? null}
        title={commentVideo?.title ?? ""}
        open={!!commentVideo}
        onClose={() => setCommentVideo(null)}
      />
    </>
  );
}
