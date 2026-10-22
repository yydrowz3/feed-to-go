import { createFileRoute } from "@tanstack/react-router";
import { ConversationPage } from "../features/StagePages";
import { parseResourceId } from "../lib/navigation";
export const Route = createFileRoute("/messages/$peerId")({
  beforeLoad: ({ params }) => {
    parseResourceId(params.peerId);
  },
  component: ConversationPage,
});
