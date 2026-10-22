import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";
export const Route = createFileRoute("/messages")({
  beforeLoad: requireAuth,
  component: Outlet,
});
