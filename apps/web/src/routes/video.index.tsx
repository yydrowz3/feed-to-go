import { createFileRoute } from "@tanstack/react-router";
import { PublishPage } from "../features/publish/publish-page";
import { requireAuth } from "../lib/route-auth";
export const Route = createFileRoute("/video/")({
  beforeLoad: requireAuth,
  component: PublishPage,
});
