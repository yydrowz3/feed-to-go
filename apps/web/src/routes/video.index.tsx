import { createFileRoute } from "@tanstack/react-router";
import { PublishPage } from "../features/StagePages";
import { requireAuth } from "../lib/route-auth";
export const Route = createFileRoute("/video/")({
  beforeLoad: requireAuth,
  component: PublishPage,
});
