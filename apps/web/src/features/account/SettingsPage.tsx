import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth, useRuntime } from "../../lib/app-context";
import { isCancellation } from "../../api/client";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AccountIdentity } from "./AccountIdentity";
import { logoutSession, renameAccount } from "./session-actions";
import { AccountForm } from "./AccountForm";
import { NativeDialog } from "../../components/NativeDialog";
import { useActionScope } from "./use-action-scope";

export function SettingsPage() {
  const auth = useAuth();
  return <SettingsContent key={auth.sessionId} />;
}
function SettingsContent() {
  const auth = useAuth();
  const runtime = useRuntime();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const pending = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await logoutSession(runtime, lifetime.current?.signal);
      if (!result.completed) return;
      if (result.error && !isCancellation(result.error))
        toast.error("服务端退出失败，本地登录状态已清除");
      else if (!result.error) toast.success("已退出登录");
      await router.invalidate();
      await router.navigate({ to: "/", replace: true });
    } finally {
      pending.current = false;
      setBusy(false);
      setOpen(false);
    }
  }
  return (
    <section className="card mx-auto max-w-xl bg-base-200">
      <div className="card-body gap-6">
        <h1 className="text-2xl font-bold">账号设置</h1>
        <AccountIdentity username={auth.username} accountId={auth.accountId} />
        <p className="text-base-content/60">
          管理用户名和登录状态。修改密码后需要重新登录当前账号。
        </p>
        <button type="button" className="btn self-start" onClick={() => setRenameOpen(true)}>
          修改用户名
        </button>
        <Link to="/account/change-password" className="btn self-start">
          修改密码
        </Link>
        <NativeDialog open={renameOpen} title="修改用户名" onClose={() => setRenameOpen(false)}>
          {renameOpen && <RenameForm close={() => setRenameOpen(false)} />}
        </NativeDialog>
        <button
          type="button"
          className="btn btn-error self-start"
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          <LogOut size={18} />
          退出登录
        </button>
        <ConfirmDialog
          open={open}
          title="退出登录？"
          description="退出后可随时重新登录此账号。"
          busy={busy}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          onConfirm={() => {
            void logout();
          }}
        />
      </div>
    </section>
  );
}
function RenameForm({ close }: { close: () => void }) {
  const runtime = useRuntime();
  const auth = useAuth();
  const getSignal = useActionScope();
  return (
    <AccountForm
      fields={[
        { name: "username", label: "新用户名", initial: auth.username, autoComplete: "username" },
      ]}
      submitLabel="保存用户名"
      onSubmit={async (values) => {
        await renameAccount(runtime, values.username, getSignal());
        toast.success("用户名已更新");
        close();
      }}
    />
  );
}
