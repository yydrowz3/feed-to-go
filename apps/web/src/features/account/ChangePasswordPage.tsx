import { useAppTranslation } from "../../i18n/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "../../i18n/toast";
import { useAuth, useRuntime } from "../../lib/app-context";
import { AccountForm } from "./AccountForm";
import { changePassword } from "./session-actions";
import { useActionScope } from "./use-action-scope";

export function ChangePasswordPage() {
  const runtime = useRuntime();
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <ChangePasswordForm
      key={auth.sessionId}
      username={auth.username}
      submit={async (values, signal) => {
        await changePassword(runtime, values, signal);
        toast.success("account.passwordChanged");
        await navigate({ to: "/account", replace: true });
      }}
    />
  );
}
function ChangePasswordForm({
  username,
  submit,
}: {
  username: string;
  submit: (values: Record<string, string>, signal: AbortSignal) => Promise<void>;
}) {
  const { t } = useAppTranslation();
  const getSignal = useActionScope();
  return (
    <section className="card mx-auto max-w-md bg-base-200">
      <div className="card-body gap-5">
        <h1 className="text-2xl font-bold">{t("account.changePassword")}</h1>
        <AccountForm
          fields={[
            {
              name: "username",
              label: t("account.username"),
              initial: username,
              autoComplete: "username",
            },
            {
              name: "old_password",
              label: t("account.oldPassword"),
              password: true,
              autoComplete: "current-password",
            },
            {
              name: "new_password",
              label: t("account.newPassword"),
              password: true,
              autoComplete: "new-password",
            },
          ]}
          submitLabel={t("account.changePassword")}
          onSubmit={(values) => submit(values, getSignal())}
        />
        <Link to="/account" className="link">
          {t("account.backAccount")}
        </Link>
      </div>
    </section>
  );
}
