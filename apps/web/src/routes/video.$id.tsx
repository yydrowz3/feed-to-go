import { createFileRoute } from "@tanstack/react-router";
import { VideoPage } from "../features/StagePages";
import { parseResourceId } from "../lib/navigation";
export const Route = createFileRoute("/video/$id")({
  beforeLoad: ({ params }) => {
    parseResourceId(params.id);
  },
  component: VideoPage,
});
