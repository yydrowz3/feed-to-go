import { createFileRoute } from "@tanstack/react-router";
import { MessagesPage } from "../features/StagePages";
export const Route = createFileRoute("/messages/")({
  component: MessagesPage,
});
