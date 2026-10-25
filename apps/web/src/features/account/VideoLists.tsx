import { useAppTranslation } from "../../i18n/react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useRuntime } from "../../lib/app-context";
import { queryKeys } from "../../lib/query-keys";
import { VideoCard } from "../video/VideoCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";

export function VideoList({ authorId, liked = false }: { authorId: number; liked?: boolean }) {
  const { t } = useAppTranslation();
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
        message={liked ? t("errors.likedLoad") : t("errors.videosLoad")}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data.length)
    return <EmptyState title={liked ? t("account.noLiked") : t("account.noVideos")} />;
  return (
    <div className="grid min-w-0 gap-4">
      {query.data.map((item) => (
        <VideoCard key={item.id} item={item} />
      ))}
    </div>
  );
}
