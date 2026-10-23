import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useAuth, useRuntime } from "../../lib/app-context";
import { parseResourceId } from "../../lib/navigation";
import { queryKeys } from "../../lib/query-keys";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { FeedSlide } from "../feed/FeedSlide";
import { useVideoPlayer, useVideoShortcuts } from "./use-video-player";
import { useLikedVideo } from "./queries";
import type { Video } from "../../api/types";
import { useState } from "react";
import { CommentDrawer } from "../comments/CommentDrawer";
export function VideoDetailPage() {
  const { id } = useParams({ from: "/video/$id" });
  return <VideoDetail key={id} id={parseResourceId(id)} />;
}
function VideoDetail({ id }: { id: number }) {
  const { services } = useRuntime();
  const auth = useAuth();
  const query = useQuery({
    queryKey: queryKeys.video(auth, id),
    queryFn: ({ signal }) => services.video.getDetail(id, signal),
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError && !query.data)
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  return (
    query.data && (
      <>
        <DetailPlayer key={`${auth.sessionId}:${id}`} video={query.data} />
        {query.isError && (
          <p role="alert" className="absolute right-4 top-24 rounded-box bg-base-200 p-3">
            详情刷新失败，已保留当前内容。
            <button className="btn btn-xs" onClick={() => void query.refetch()}>
              重试
            </button>
          </p>
        )}
      </>
    )
  );
}
function DetailPlayer({ video }: { video: Video }) {
  const [comments, setComments] = useState(false);
  const auth = useAuth();
  const liked = useLikedVideo(video.id);
  const player = useVideoPlayer(video.id);
  useVideoShortcuts({ player, comments: () => setComments(true) });
  const item = {
    ...video,
    author: { id: video.author_id, username: video.username },
    create_time: new Date(video.create_time).getTime() / 1000,
    is_liked: liked.data?.is_liked ?? false,
  };
  return (
    <div className="min-h-0 flex-1">
      <FeedSlide
        item={item}
        mounted
        active
        player={player}
        detail
        likeReady={!auth.accessToken || !!liked.data}
        onComments={() => setComments(true)}
      />
      <CommentDrawer
        videoId={video.id}
        title={video.title}
        open={comments}
        onClose={() => setComments(false)}
      />
      {liked.isError && (
        <p role="alert" className="absolute right-4 top-24 rounded-box bg-base-200 p-3">
          点赞状态加载失败{" "}
          <button className="btn btn-xs" onClick={() => void liked.refetch()}>
            重试
          </button>
        </p>
      )}
    </div>
  );
}
