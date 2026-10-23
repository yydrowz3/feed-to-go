import { Link } from "@tanstack/react-router";
import type { FeedVideoItem, Video } from "../../api/types";
import { useRuntime } from "../../lib/app-context";
import { mediaUrl } from "../../lib/media-url";
import { ShareButton } from "./ShareButton";
import { LikeButton } from "./LikeButton";
import { useLikedVideo } from "./queries";
export function VideoCard({ item }: { item: FeedVideoItem | Video }) {
  const { baseUrl } = useRuntime();
  const isFeed = "author" in item;
  const liked = useLikedVideo(item.id, !isFeed);
  const author = isFeed ? item.author : { id: item.author_id, username: item.username };
  const date = new Date(isFeed ? item.create_time * 1000 : item.create_time);
  return (
    <article className="card min-w-0 flex-1 bg-base-200 sm:card-side">
      <Link to="/video/$id" params={{ id: String(item.id) }} className="block shrink-0 sm:w-48">
        <img
          src={mediaUrl(item.cover_url, baseUrl) || undefined}
          alt={item.title}
          loading="lazy"
          className="aspect-video w-full object-cover sm:h-full"
        />
      </Link>
      <div className="card-body min-w-0 gap-3 p-4">
        <Link to="/video/$id" params={{ id: String(item.id) }} className="card-title break-words">
          {item.title}
        </Link>
        <Link to="/u/$id" params={{ id: String(author.id) }} className="link link-hover">
          @{author.username}
        </Link>
        <time
          dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}
          className="text-xs text-base-content/60"
        >
          {Number.isNaN(date.getTime()) ? "日期未知" : date.toLocaleString()}
        </time>
        <div className="card-actions items-center">
          <LikeButton
            videoId={item.id}
            liked={isFeed ? item.is_liked : (liked.data?.is_liked ?? false)}
            count={item.likes_count}
            ready={isFeed || !!liked.data}
          />
          <ShareButton videoId={item.id} />
        </div>
        {!isFeed && liked.isError && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void liked.refetch()}
          >
            重试点赞状态
          </button>
        )}
      </div>
    </article>
  );
}
