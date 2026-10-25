import { useAppTranslation } from "../../i18n/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "../../i18n/toast";
import { useRuntime } from "../../lib/app-context";
import { AccountForm } from "./AccountForm";
import { registerAccount } from "./session-actions";
import { useActionScope } from "./use-action-scope";

export function RegisterPage() {
  const { t } = useAppTranslation();
  const runtime = useRuntime();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/account/register" });
  const getSignal = useActionScope();
  return (
    <section className="card mx-auto max-w-md bg-base-200">
      <div className="card-body gap-5">
        <h1 className="text-2xl font-bold">{t("account.createAccount")}</h1>
        <AccountForm
          fields={[
            { name: "username", label: t("account.username"), autoComplete: "username" },
            {
              name: "password",
              label: t("account.password"),
              password: true,
              autoComplete: "new-password",
            },
          ]}
          submitLabel={t("account.register")}
          onSubmit={async (values) => {
            const signal = getSignal();
            await registerAccount(runtime, values, signal);
            signal.throwIfAborted();
            toast.success("account.registered");
            await navigate({ to: "/account", search: { redirect }, replace: true });
          }}
        />
        <Link to="/account" search={{ redirect }} className="link">
          {t("account.backSignIn")}
        </Link>
      </div>
    </section>
  );
}
