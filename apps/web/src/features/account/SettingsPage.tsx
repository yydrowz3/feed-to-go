import { useAppTranslation } from "../../i18n/react";
import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { toast } from "../../i18n/toast";
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
  const { t } = useAppTranslation();
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
      if (result.error && !isCancellation(result.error)) toast.error("account.logoutLocal");
      else if (!result.error) toast.success("account.loggedOut");
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
        <h1 className="text-2xl font-bold">{t("account.settings")}</h1>
        <AccountIdentity
          username={auth.username || t("common.anonymous")}
          accountId={auth.accountId}
        />
        <p className="text-base-content/60">{t("account.settingsHelp")}</p>
        <button
          type="button"
          data-testid="rename-open"
          className="btn self-start"
          onClick={() => setRenameOpen(true)}
        >
          {t("account.rename")}
        </button>
        <Link to="/account/change-password" className="btn self-start">
          {t("account.changePassword")}
        </Link>
        <NativeDialog
          open={renameOpen}
          title={t("account.rename")}
          onClose={() => setRenameOpen(false)}
        >
          {renameOpen && <RenameForm close={() => setRenameOpen(false)} />}
        </NativeDialog>
        <button
          type="button"
          className="btn btn-error self-start"
          data-testid="signout-open"
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          <LogOut size={18} />
          {t("account.signOut")}
        </button>
        <ConfirmDialog
          open={open}
          title={t("account.signOutConfirm")}
          description={t("account.signOutHelp")}
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
  const { t } = useAppTranslation();
  const runtime = useRuntime();
  const auth = useAuth();
  const getSignal = useActionScope();
  return (
    <AccountForm
      fields={[
        {
          name: "username",
          label: t("account.newUsername"),
          initial: auth.username,
          autoComplete: "username",
        },
      ]}
      submitLabel={t("account.saveUsername")}
      onSubmit={async (values) => {
        await renameAccount(runtime, values.username, getSignal());
        toast.success("account.usernameUpdated");
        close();
      }}
    />
  );
}
