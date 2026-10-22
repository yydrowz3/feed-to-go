import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Home, Flame, Plus, UserRound, MessageCircle, Settings, Search, Play } from "lucide-react";
import { useAuth } from "../lib/app-context";
import { UserAvatar } from "./UserAvatar";
const navigation = [
  { to: "/", label: "推荐", icon: Home },
  { to: "/hot", label: "热榜", icon: Flame },
  { to: "/video", label: "发布", icon: Plus },
  { to: "/account", label: "账号", icon: UserRound },
  { to: "/messages", label: "私信", icon: MessageCircle },
  { to: "/settings", label: "设置", icon: Settings },
] as const;
export function AppShell({ children }: { children: ReactNode }) {
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
          ShortVideo
        </Link>
        <nav className="grid gap-2" aria-label="主导航">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="btn btn-ghost justify-start"
              activeProps={{ className: "btn-active text-primary" }}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-3 border-t border-base-content/10 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar username={auth.username || "访客"} size="sm" />
            <span className="truncate text-sm">
              {auth.accessToken ? auth.username + " #" + auth.accountId : "未登录"}
            </span>
          </div>
          <Link to={auth.accessToken ? "/settings" : "/account"} className="btn btn-primary btn-sm">
            {auth.accessToken ? "账号设置" : "登录"}
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-4 border-b border-base-content/10 bg-base-200 px-3 py-3 md:px-6">
          <form
            className="mx-auto flex w-full max-w-xl gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field name="q">
              {(field) => (
                <input
                  aria-label="搜索标题或作者"
                  className="input min-w-0 flex-1"
                  placeholder="搜索标题 / 作者（本地过滤）"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
            <button type="submit" className="btn btn-primary" aria-label="搜索">
              <Search size={18} />
              <span className="hidden sm:inline">搜索</span>
            </button>
          </form>
          <Link to="/video" className="btn btn-ghost hidden lg:inline-flex">
            <Plus size={18} />
            发布视频
          </Link>
        </header>
        <nav
          aria-label="移动端导航"
          className="flex shrink-0 overflow-x-auto border-b border-base-content/10 bg-base-200 md:hidden"
        >
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex min-w-14 flex-1 flex-col items-center gap-1 px-2 py-3 text-xs"
              activeProps={{ className: "bg-primary/10 text-primary" }}
            >
              <Icon size={18} />
              {label}
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
