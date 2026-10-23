import type { QueryClient, QueryKey, InfiniteData } from "@tanstack/react-query";
import type { FeedPageData } from "../feed/pagination.ts";
import type { Video } from "../../api/types.ts";
import { queryKeys } from "../../lib/query-keys.ts";
type Viewer = { sessionId: number; accountId: number };
export function inViewer(key: QueryKey, viewer: Viewer) {
  return key[1] === viewer.sessionId && key[2] === viewer.accountId;
}
export function patchLikeCache(
  client: QueryClient,
  viewer: Viewer,
  videoId: number,
  wasLiked: boolean,
) {
  const delta = wasLiked ? -1 : 1;
  const patch = <T extends { id: number; likes_count: number }>(video: T): T =>
    video.id === videoId
      ? {
          ...video,
          likes_count: Math.max(0, video.likes_count + delta),
          ...("is_liked" in video ? { is_liked: !wasLiked } : {}),
        }
      : video;
  client.setQueriesData<InfiniteData<FeedPageData>>(
    { predicate: (query) => inViewer(query.queryKey, viewer) && query.queryKey[0] === "feed" },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) => ({ ...page, video_list: page.video_list.map(patch) })),
      },
  );
  client.setQueriesData<Video>(
    { predicate: (query) => inViewer(query.queryKey, viewer) && query.queryKey[0] === "video" },
    (old) => old && patch(old),
  );
  client.setQueriesData<Video[]>(
    {
      predicate: (query) =>
        inViewer(query.queryKey, viewer) && ["works"].includes(String(query.queryKey[0])),
    },
    (old) => old?.map(patch),
  );
  client.setQueryData<Video[]>(queryKeys.likedVideos(viewer), (old) => {
    if (!old) return old;
    if (wasLiked) return old.filter((video) => video.id !== videoId);
    const complete =
      client.getQueryData<Video>(queryKeys.video(viewer, videoId)) ??
      client
        .getQueriesData<Video[]>({
          predicate: (query) => inViewer(query.queryKey, viewer) && query.queryKey[0] === "works",
        })
        .flatMap(([, videos]) => videos ?? [])
        .find((video) => video.id === videoId);
    const fullVideo =
      complete &&
      typeof complete.author_id === "number" &&
      [
        complete.username,
        complete.title,
        complete.play_url,
        complete.cover_url,
        complete.create_time,
      ].every((value) => typeof value === "string");
    return fullVideo && !old.some((video) => video.id === videoId) ? [complete, ...old] : old;
  });
  client.setQueryData(queryKeys.liked(viewer, videoId), { is_liked: !wasLiked });
  void client.invalidateQueries({
    predicate: (query) =>
      inViewer(query.queryKey, viewer) &&
      ["feed", "video", "liked", "my-liked", "works", "account"].includes(
        String(query.queryKey[0]),
      ),
    refetchType: "none",
  });
}
