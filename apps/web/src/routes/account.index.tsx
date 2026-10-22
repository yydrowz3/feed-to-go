import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "../features/StagePages";
import { validateAccountSearch } from "../lib/navigation";
export const Route = createFileRoute("/account/")({
  validateSearch: validateAccountSearch,
  component: AccountPage,
});
