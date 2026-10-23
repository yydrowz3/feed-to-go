import { createFileRoute } from "@tanstack/react-router";
import { FeedPage } from "../features/feed/FeedPage";

export const Route = createFileRoute("/")({
  component: FeedPage,
});
