import { createFileRoute } from "@tanstack/react-router";
import { VideoDetailPage } from "../features/video/VideoDetailPage";
import { parseResourceId } from "../lib/navigation";
export const Route = createFileRoute("/video/$id")({
  beforeLoad: ({ params }) => {
    parseResourceId(params.id);
  },
  component: VideoDetailPage,
});
