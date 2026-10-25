import { LocaleSelect } from "../i18n/ui";
import { useAppTranslation } from "../i18n/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Home, Flame, Plus, UserRound, MessageCircle, Settings, Search, Play } from "lucide-react";
import { useAuth } from "../lib/app-context";
import { UserAvatar } from "./UserAvatar";
import { ThemeToggle } from "./ThemeToggle";
const navigation = [
  { to: "/", label: "navigation.home", icon: Home },
  { to: "/hot", label: "navigation.hot", icon: Flame },
  { to: "/video", label: "navigation.publish", icon: Plus },
  { to: "/account", label: "navigation.account", icon: UserRound },
  { to: "/messages", label: "navigation.messages", icon: MessageCircle },
  { to: "/settings", label: "navigation.settings", icon: Settings },
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useAppTranslation();
  const auth = useAuth();
  const location = useLocation();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: { q: search.q ?? "" },
    validators: { onSubmit: z.object({ q: z.string() }) },
    onSubmit: async ({ value }) => {
      await navigate({ to: "/", search: { q: value.q.trim() } });
    },
  });
  useEffect(() => {
    form.setFieldValue("q", search.q ?? "");
  }, [form, search.q]);
  const full = location.pathname === "/" || /^\/video\/[^/]+$/.test(location.pathname);
  const links = navigation.filter((item) => item.to !== "/messages" || auth.accessToken);
  return (
    <div className="flex h-dvh overflow-hidden bg-base-300 font-sans text-base-content">
      <aside className="hidden w-56 shrink-0 flex-col gap-6 border-r border-base-content/10 bg-base-200 p-4 md:flex">
        <Link to="/" className="flex items-center gap-2 p-2 text-xl font-black">
          <Play className="text-primary" />
          Feed to Go
        </Link>
        <nav className="grid gap-2" aria-label={t("navigation.main")}>
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" || to === "/video" }}
              className="btn btn-ghost justify-start"
              activeProps={{ className: "btn-active text-primary" }}
            >
              <Icon size={18} />
              {t(label)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-3 border-t border-base-content/10 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar username={auth.username || t("account.guest")} size="sm" />
            <span className="truncate text-sm">
              {auth.accessToken ? auth.username + " #" + auth.accountId : t("account.signedOut")}
            </span>
          </div>
          <Link to={auth.accessToken ? "/settings" : "/account"} className="btn btn-primary btn-sm">
            {auth.accessToken ? t("account.settings") : t("account.signIn")}
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-base-content/10 bg-base-200 px-3 py-3 md:px-6">
          <form
            className="mx-auto flex min-w-0 flex-1 basis-48 max-w-xl gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field name="q">
              {(field) => (
                <input
                  aria-label={t("navigation.searchLabel")}
                  className="input min-w-0 flex-1"
                  placeholder={t("navigation.searchPlaceholder")}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
            <button type="submit" className="btn btn-primary" aria-label={t("navigation.search")}>
              <Search size={18} />
              <span className="hidden sm:inline">{t("navigation.search")}</span>
            </button>
          </form>
          <LocaleSelect />
          <ThemeToggle />
          <Link to="/video" className="btn btn-ghost hidden lg:inline-flex">
            <Plus size={18} />
            {t("publish.heading")}
          </Link>
        </header>
        <nav
          aria-label={t("navigation.mobile")}
          className="flex shrink-0 overflow-x-auto border-b border-base-content/10 bg-base-200 md:hidden"
        >
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" || to === "/video" }}
              className="flex min-w-14 flex-1 flex-col items-center gap-1 px-2 py-3 text-xs"
              activeProps={{ className: "bg-primary/10 text-primary" }}
            >
              <Icon size={18} />
              {t(label)}
            </Link>
          ))}
        </nav>
        <main
          id="main-content"
          className={
            full
              ? "flex min-h-0 flex-1 flex-col overflow-auto"
              : "min-h-0 flex-1 overflow-auto p-4 md:p-8"
          }
        >
          {full ? children : <div className="mx-auto max-w-5xl">{children}</div>}
        </main>
      </div>
    </div>
  );
}
