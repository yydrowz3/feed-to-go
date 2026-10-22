import { createFileRoute } from "@tanstack/react-router";
import { HotPage } from "../features/StagePages";
export const Route = createFileRoute("/hot")({
  component: HotPage,
});
