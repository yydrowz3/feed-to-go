import { createFileRoute } from "@tanstack/react-router";
import { ChangePasswordPage } from "../features/account/ChangePasswordPage";
export const Route = createFileRoute("/account/change-password")({
  component: ChangePasswordPage,
});
