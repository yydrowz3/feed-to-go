import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../features/StagePages";
import { requireAuth } from "../lib/route-auth";
export const Route = createFileRoute("/settings")({
  beforeLoad: requireAuth,
  component: SettingsPage,
});
