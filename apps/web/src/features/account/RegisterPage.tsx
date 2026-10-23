import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRuntime } from "../../lib/app-context";
import { AccountForm } from "./AccountForm";
import { registerAccount } from "./session-actions";
import { useActionScope } from "./use-action-scope";

export function RegisterPage() {
  const runtime = useRuntime();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/account/register" });
  const getSignal = useActionScope();
  return (
    <section className="card mx-auto max-w-md bg-base-200">
      <div className="card-body gap-5">
        <h1 className="text-2xl font-bold">注册账号</h1>
        <AccountForm
          fields={[
            { name: "username", label: "用户名", autoComplete: "username" },
            { name: "password", label: "密码", password: true, autoComplete: "new-password" },
          ]}
          submitLabel="注册"
          onSubmit={async (values) => {
            const signal = getSignal();
            await registerAccount(runtime, values, signal);
            signal.throwIfAborted();
            toast.success("注册成功，请登录");
            await navigate({ to: "/account", search: { redirect }, replace: true });
          }}
        />
        <Link to="/account" search={{ redirect }} className="link">
          返回登录
        </Link>
      </div>
    </section>
  );
}
