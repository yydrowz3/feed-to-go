import { useRouteContext } from "@tanstack/react-router";
import { useStore } from "zustand";
export function useRuntime() {
  return useRouteContext({ from: "__root__" });
}
export function useAuth() {
  const { authStore } = useRuntime();
  return useStore(authStore);
}
