import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "../../i18n/toast";
import { useAuth, useRuntime } from "../../lib/app-context";
import { queryKeys } from "../../lib/query-keys";
import { isCancellation } from "../../api/client";
import type { Account } from "../../api/types";
import { followAuthor, likeVideo } from "./actions";

export function useRequireLogin() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (auth.accessToken) return false;
    toast.info("account.signInRequired");
    void navigate({ to: "/account", search: { redirect: location.href } });
    return true;
  };
}
export function useLikeAction(videoId: number, wasLiked: boolean, ready = true) {
  const runtime = useRuntime();
  const auth = useAuth();
  const needLogin = useRequireLogin();
  const mutationKey = ["like-action", auth.sessionId, auth.accountId, videoId];
  const busy = useIsMutating({ mutationKey }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (runtime.authStore.getState().sessionId !== auth.sessionId) return;
      try {
        const applied = await likeVideo(runtime, videoId, wasLiked);
        if (applied && runtime.authStore.getState().sessionId === auth.sessionId)
          toast.success(wasLiked ? "social.unliked" : "social.liked");
      } catch (cause) {
        if (!isCancellation(cause) && runtime.authStore.getState().sessionId === auth.sessionId)
          toast.error(cause);
      }
    },
  });
  return {
    busy,
    disabled: busy || (!!auth.accessToken && !ready),
    toggle: () => {
      if (!needLogin() && ready) mutation.mutate();
    },
  };
}
export function useFollowings(enabled = true) {
  const { services } = useRuntime();
  const auth = useAuth();
  return useQuery({
    queryKey: queryKeys.followings(auth, auth.accountId),
    enabled: !!auth.accessToken && enabled,
    queryFn: ({ signal }) => services.social.getAllVloggers(auth.accountId, signal),
  });
}
export function useFollowAction(author: Account) {
  const runtime = useRuntime();
  const auth = useAuth();
  const needLogin = useRequireLogin();
  const query = useFollowings(author.id !== auth.accountId);
  const following = !!query.data?.followings.some((item) => item.id === author.id);
  const mutationKey = ["follow-action", auth.sessionId, auth.accountId, author.id];
  const busy = useIsMutating({ mutationKey }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (runtime.authStore.getState().sessionId !== auth.sessionId) return;
      try {
        const applied = await followAuthor(runtime, author, following);
        if (applied && runtime.authStore.getState().sessionId === auth.sessionId)
          toast.success(following ? "social.unfollowed" : "social.following");
      } catch (cause) {
        if (!isCancellation(cause) && runtime.authStore.getState().sessionId === auth.sessionId)
          toast.error(cause);
      }
    },
  });
  return {
    query,
    following,
    busy,
    hidden: auth.accountId === author.id,
    disabled: busy || (!!auth.accessToken && !query.data),
    toggle: () => {
      if (!needLogin() && query.data) mutation.mutate();
    },
  };
}
