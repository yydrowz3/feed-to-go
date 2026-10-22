import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../features/account/SettingsPage";
import { requireAuth } from "../lib/route-auth";
export const Route = createFileRoute("/settings")({
  beforeLoad: requireAuth,
  component: SettingsPage,
});
