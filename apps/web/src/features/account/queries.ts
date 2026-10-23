import { useQuery } from "@tanstack/react-query";
import { useAuth, useRuntime } from "../../lib/app-context";
import { queryKeys } from "../../lib/query-keys";

export function useAccount(id: number) {
  const runtime = useRuntime();
  const auth = useAuth();
  return useQuery({
    queryKey: queryKeys.profile(auth, id),
    enabled: id > 0,
    queryFn: ({ signal }) => runtime.services.account.findByID(id, signal),
  });
}
export function useSocialLists(id: number, enabled = true) {
  const { services } = useRuntime();
  const auth = useAuth();
  const followers = useQuery({
    queryKey: queryKeys.followers(auth, id),
    enabled: enabled && !!auth.accessToken,
    queryFn: ({ signal }) => services.social.getAllFollowers(id, signal),
  });
  const followings = useQuery({
    queryKey: queryKeys.followings(auth, id),
    enabled: enabled && !!auth.accessToken,
    queryFn: ({ signal }) => services.social.getAllVloggers(id, signal),
  });
  return { followers, followings };
}
