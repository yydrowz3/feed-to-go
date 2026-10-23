import { createFileRoute } from "@tanstack/react-router";
import { HotPage } from "../features/feed/HotPage";
export const Route = createFileRoute("/hot")({
  component: HotPage,
});
