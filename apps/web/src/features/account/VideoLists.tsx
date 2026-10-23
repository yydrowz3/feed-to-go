import { useQuery } from "@tanstack/react-query";
import { useAuth, useRuntime } from "../../lib/app-context";
import { queryKeys } from "../../lib/query-keys";
import { VideoCard } from "../video/VideoCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";

export function VideoList({ authorId, liked = false }: { authorId: number; liked?: boolean }) {
  const { services } = useRuntime();
  const auth = useAuth();
  const query = useQuery({
    queryKey: liked ? queryKeys.likedVideos(auth) : queryKeys.authorVideos(auth, authorId),
    enabled: liked ? !!auth.accessToken : authorId > 0,
    queryFn: ({ signal }) =>
      liked
        ? services.like.listMyLikedVideos(signal)
        : services.video.listByAuthorID(authorId, signal),
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        message={liked ? "喜欢列表加载失败" : "作品加载失败"}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data.length) return <EmptyState title={liked ? "暂无喜欢的视频" : "暂无作品"} />;
  return (
    <div className="grid min-w-0 gap-4">
      {query.data.map((item) => (
        <VideoCard key={item.id} item={item} />
      ))}
    </div>
  );
}
