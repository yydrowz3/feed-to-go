import type { AppRuntime } from "../../lib/runtime.ts";
import type {
  Account,
  GetAllFollowingsResponse,
  GetAllFollowersResponse,
} from "../../api/types.ts";
import { createActionGate } from "../../lib/action-gate.ts";
import { queryKeys } from "../../lib/query-keys.ts";
import { inViewer, patchLikeCache } from "../video/cache.ts";
const gates = new WeakMap<AppRuntime, ReturnType<typeof createActionGate>>();
export async function runSessionAction(
  runtime: AppRuntime,
  key: string,
  request: (signal: AbortSignal) => Promise<unknown>,
  apply: () => void,
) {
  const viewer = runtime.authStore.getState();
  if (!viewer.accessToken) throw new Error("请先登录");
  let gate = gates.get(runtime);
  if (!gate) {
    gate = createActionGate();
    gates.set(runtime, gate);
  }
  return gate.run(`${viewer.sessionId}:${key}`, async () => {
    const controller = new AbortController();
    const release = runtime.registerSessionTask(() => controller.abort());
    try {
      await request(controller.signal);
      if (controller.signal.aborted || runtime.authStore.getState().sessionId !== viewer.sessionId)
        return false;
      apply();
      return true;
    } finally {
      release();
    }
  });
}
export function likeVideo(runtime: AppRuntime, videoId: number, wasLiked: boolean) {
  const viewer = runtime.authStore.getState();
  return runSessionAction(
    runtime,
    `like:${videoId}`,
    (signal) =>
      wasLiked
        ? runtime.services.like.unlike(videoId, signal)
        : runtime.services.like.like(videoId, signal),
    () => patchLikeCache(runtime.queryClient, viewer, videoId, wasLiked),
  );
}
export function followAuthor(runtime: AppRuntime, author: Account, wasFollowing: boolean) {
  const viewer = runtime.authStore.getState();
  return runSessionAction(
    runtime,
    `follow:${author.id}`,
    (signal) =>
      wasFollowing
        ? runtime.services.social.unfollow(author.id, signal)
        : runtime.services.social.follow(author.id, signal),
    () => {
      runtime.queryClient.setQueryData<GetAllFollowingsResponse>(
        queryKeys.followings(viewer, viewer.accountId),
        (old) => {
          if (!old) return old;
          const followings = old.followings.filter((item) => item.id !== author.id);
          if (!wasFollowing) followings.push(author);
          return {
            ...old,
            followings,
            followings_count: Math.max(0, old.followings_count + (wasFollowing ? -1 : 1)),
          };
        },
      );
      runtime.queryClient.setQueryData<GetAllFollowersResponse>(
        queryKeys.followers(viewer, author.id),
        (old) => {
          if (!old) return old;
          const followers = old.followers.filter((account) => account.id !== viewer.accountId);
          if (!wasFollowing) followers.push({ id: viewer.accountId, username: viewer.username });
          return {
            ...old,
            followers,
            follower_count: Math.max(0, old.follower_count + (wasFollowing ? -1 : 1)),
          };
        },
      );
      void runtime.queryClient.invalidateQueries({
        predicate: (query) =>
          inViewer(query.queryKey, viewer) &&
          ((["followings", "followers", "account", "socialCounts"].includes(
            String(query.queryKey[0]),
          ) &&
            [viewer.accountId, author.id].includes(Number(query.queryKey[3]))) ||
            query.queryKey[0] === "contacts" ||
            (query.queryKey[0] === "feed" && query.queryKey[3] === "following")),
        refetchType: "none",
      });
    },
  );
}
