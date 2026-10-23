import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "../features/account/RegisterPage";
import { validateAccountSearch } from "../lib/navigation";
export const Route = createFileRoute("/account/register")({
  component: RegisterPage,
  validateSearch: validateAccountSearch,
});
