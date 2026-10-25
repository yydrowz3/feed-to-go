import { useAppTranslation } from "../../i18n/react";
export function AccountIdentity({ username, accountId }: { username: string; accountId: number }) {
  const { t } = useAppTranslation();
  return (
    <div className="space-y-2">
      <h1 className="break-words text-2xl font-bold">{username || t("common.anonymous")}</h1>
      <p>{t("account.identity", { id: accountId })}</p>
    </div>
  );
}
