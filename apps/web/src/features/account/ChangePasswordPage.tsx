import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
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
        toast.success("密码已修改，请登录");
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
  const getSignal = useActionScope();
  return (
    <section className="card mx-auto max-w-md bg-base-200">
      <div className="card-body gap-5">
        <h1 className="text-2xl font-bold">修改密码</h1>
        <AccountForm
          fields={[
            { name: "username", label: "用户名", initial: username, autoComplete: "username" },
            {
              name: "old_password",
              label: "旧密码",
              password: true,
              autoComplete: "current-password",
            },
            { name: "new_password", label: "新密码", password: true, autoComplete: "new-password" },
          ]}
          submitLabel="修改密码"
          onSubmit={(values) => submit(values, getSignal())}
        />
        <Link to="/account" className="link">
          返回账号
        </Link>
      </div>
    </section>
  );
}
