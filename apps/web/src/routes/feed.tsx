import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/feed")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search: { q: search.q }, replace: true });
  },
});
