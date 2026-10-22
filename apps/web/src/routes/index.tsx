import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "../features/StagePages";

export const Route = createFileRoute("/")({
  component: HomePage,
});
