import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "../features/StagePages";
export const Route = createFileRoute("/account/register")({
  component: RegisterPage,
});
