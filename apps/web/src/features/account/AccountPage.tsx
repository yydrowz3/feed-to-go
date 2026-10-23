import { useEffect, useRef, useState } from "react";
import { Link, useRouter, useSearch } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAuth, useRuntime } from "../../lib/app-context";
import { isCancellation } from "../../api/client";
import { FormField } from "../../components/FormField";
import { MyAccountPage } from "./MyAccountPage";
import { loginSchema, loginSession } from "./session-actions";

export function AccountPage() {
  const runtime = useRuntime();
  const auth = useAuth();
  const router = useRouter();
  const { redirect } = useSearch({ from: "/account/" });
  const [error, setError] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const form = useForm({
    defaultValues: { username: "", password: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        const target = await loginSession(runtime, value, redirect, lifetime.current?.signal);
        form.setFieldValue("password", "");
        toast.success("登录成功");
        await router.invalidate();
        if (target) await router.navigate({ href: target, replace: true });
      } catch (cause) {
        if (!isCancellation(cause))
          setError(cause instanceof Error ? cause.message : "登录失败，请稍后重试");
      }
    },
  });
  if (auth.accessToken) return <MyAccountPage key={auth.sessionId} />;
  return (
    <section className="card mx-auto max-w-md bg-base-200 shadow-lg">
      <div className="card-body gap-6">
        <div>
          <h1 className="text-2xl font-bold">登录 ShortVideo</h1>
          <p className="mt-2 text-base-content/60">登录后即可互动和发布视频。</p>
        </div>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <fieldset disabled={isSubmitting} className="grid gap-5">
                <form.Field name="username">
                  {(field) => (
                    <FormField id="login-username" label="用户名" errors={field.state.meta.errors}>
                      <input
                        id="login-username"
                        name="username"
                        className="input w-full"
                        autoComplete="username"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={
                          field.state.meta.errors.length ? "login-username-error" : undefined
                        }
                      />
                    </FormField>
                  )}
                </form.Field>
                <form.Field name="password">
                  {(field) => (
                    <FormField id="login-password" label="密码" errors={field.state.meta.errors}>
                      <input
                        id="login-password"
                        name="password"
                        type="password"
                        className="input w-full"
                        autoComplete="current-password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={
                          field.state.meta.errors.length ? "login-password-error" : undefined
                        }
                      />
                    </FormField>
                  )}
                </form.Field>
                {error && (
                  <p role="alert" className="text-sm text-error">
                    {error}
                  </p>
                )}
                <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <LogIn size={18} />
                  )}
                  {isSubmitting ? "登录中…" : "登录"}
                </button>
              </fieldset>
            )}
          </form.Subscribe>
        </form>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <Link to="/account/register" search={{ redirect }} className="link link-primary">
            注册账号
          </Link>
          <Link to="/account/change-password" className="link link-hover">
            修改密码
          </Link>
        </div>
      </div>
    </section>
  );
}
