import { useQuery } from "@tanstack/react-query";
import { useAuth, useRuntime } from "../../lib/app-context";
import { queryKeys } from "../../lib/query-keys";
export function useLikedVideo(videoId: number, enabled = true) {
  const { services } = useRuntime();
  const auth = useAuth();
  return useQuery({
    queryKey: queryKeys.liked(auth, videoId),
    enabled: !!auth.accessToken && enabled,
    queryFn: ({ signal }) => services.like.isLiked(videoId, signal),
  });
}
