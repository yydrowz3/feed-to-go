import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "../features/account/ProfilePage";
import { parseResourceId } from "../lib/navigation";
export const Route = createFileRoute("/u/$id")({
  beforeLoad: ({ params }) => {
    parseResourceId(params.id);
  },
  component: ProfilePage,
});
