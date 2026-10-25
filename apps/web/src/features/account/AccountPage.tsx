import { useAppTranslation } from "../../i18n/react";
import { useEffect, useRef, useState } from "react";
import { Link, useRouter, useSearch } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { LogIn } from "lucide-react";
import { toast } from "../../i18n/toast";
import { useAuth, useRuntime } from "../../lib/app-context";
import { isCancellation } from "../../api/client";
import { FormField } from "../../components/FormField";
import { MyAccountPage } from "./MyAccountPage";
import { loginSchema, loginSession } from "./session-actions";

export function AccountPage() {
  const { t, message: displayMessage } = useAppTranslation();
  const runtime = useRuntime();
  const auth = useAuth();
  const router = useRouter();
  const { redirect } = useSearch({ from: "/account/" });
  const [error, setError] = useState<unknown>(null);
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
      setError(null);
      try {
        const target = await loginSession(runtime, value, redirect, lifetime.current?.signal);
        form.setFieldValue("password", "");
        toast.success("account.signedIn");
        await router.invalidate();
        if (target) await router.navigate({ href: target, replace: true });
      } catch (cause) {
        if (!isCancellation(cause)) setError(cause);
      }
    },
  });
  if (auth.accessToken) return <MyAccountPage key={auth.sessionId} />;
  return (
    <section className="card mx-auto max-w-md bg-base-200 shadow-lg">
      <div className="card-body gap-6">
        <div>
          <h1 className="text-2xl font-bold">{t("account.signInHeading")}</h1>
          <p className="mt-2 text-base-content/60">{t("account.signInHelp")}</p>
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
                    <FormField
                      id="login-username"
                      label={t("account.username")}
                      errors={field.state.meta.errors}
                    >
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
                    <FormField
                      id="login-password"
                      label={t("account.password")}
                      errors={field.state.meta.errors}
                    >
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
                {!!error && (
                  <p role="alert" className="text-sm text-error">
                    {displayMessage(error)}
                  </p>
                )}
                <button
                  type="submit"
                  data-testid="form-submit"
                  className="btn btn-primary w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <LogIn size={18} />
                  )}
                  {isSubmitting ? t("account.signingIn") : t("account.signIn")}
                </button>
              </fieldset>
            )}
          </form.Subscribe>
        </form>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <Link to="/account/register" search={{ redirect }} className="link link-primary">
            {t("account.createAccount")}
          </Link>
          <Link to="/account/change-password" className="link link-hover">
            {t("account.changePassword")}
          </Link>
        </div>
      </div>
    </section>
  );
}
