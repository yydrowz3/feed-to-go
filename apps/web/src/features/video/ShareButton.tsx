import { useAppTranslation } from "../../i18n/react";
import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "../../i18n/toast";
import { NativeDialog } from "../../components/NativeDialog";
export function ShareButton({ videoId }: { videoId: number }) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const url = `${window.location.origin}/video/${videoId}`;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("video.copied");
    } catch {
      setOpen(true);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => void share()}>
        <Share2 size={16} />
        {t("video.share")}
      </button>
      <NativeDialog open={open} title={t("video.copyLink")} onClose={() => setOpen(false)}>
        <input
          className="input w-full"
          aria-label={t("video.shareLink")}
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
        />
      </NativeDialog>
    </>
  );
}
