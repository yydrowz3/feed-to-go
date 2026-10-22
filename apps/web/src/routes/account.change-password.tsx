import { createFileRoute } from "@tanstack/react-router";
import { ChangePasswordPage } from "../features/StagePages";
export const Route = createFileRoute("/account/change-password")({
  component: ChangePasswordPage,
});
