import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import type { AppRuntime } from '../lib/runtime';

const RootLayout = () => (
  <>
    <div className="p-2 flex gap-2">
      <Link to="/" className="[&.active]:font-bold">
        Home
      </Link>{" "}
      <Link to="/about" className="[&.active]:font-bold">
        About
      </Link>
    </div>
    <hr />
    <Outlet />
    <Toaster />
  </>
);

export const Route = createRootRouteWithContext<AppRuntime>()({ component: RootLayout });
