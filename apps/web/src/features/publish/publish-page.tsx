import { useAppTranslation } from "../../i18n/react";
import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { FormField } from "../../components/FormField";
import { publishSchema, type PublishDraft } from "./validation";
import { usePublishVideo } from "./use-publish-video";
import { stageLabels } from "./task";
import { Link } from "@tanstack/react-router";
import { useAuth } from "../../lib/app-context";

function FilePreview({ file, kind }: { file: File; kind: "video" | "cover" }) {
  const { number, t } = useAppTranslation();
  const [url, setUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize the Blob URL with its revocation lifetime
    setUrl(next);

    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="grid gap-2">
      <p className="break-all text-sm">
        {file.name} ·{" "}
        {number(file.size / 1024 / 1024, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
        MiB
      </p>
      {url &&
        (kind === "video" ? (
          <video
            key={url}
            src={url}
            controls
            className="max-h-80 w-full rounded-box bg-black"
            onError={(event) => setFailedUrl(event.currentTarget.src)}
          />
        ) : (
          <img
            key={url}
            src={url}
            alt={t("publish.coverPreview")}
            className="max-h-64 max-w-full rounded-box object-contain"
            onError={(event) => setFailedUrl(event.currentTarget.src)}
          />
        ))}
      {url && failedUrl === url && (
        <p role="alert" className="text-warning">
          {t("publish.previewFailed")}
        </p>
      )}
    </div>
  );
}

export function PublishPage() {
  const auth = useAuth();
  return <PublishContent key={auth.sessionId} />;
}
function PublishContent() {
  const { number, t, message: displayMessage } = useAppTranslation();
  const upload = usePublishVideo();
  const form = useForm({
    defaultValues: { title: "", description: "", video: null, cover: null } as PublishDraft,
    validators: { onSubmit: publishSchema },
    onSubmit: async ({ value }) => {
      if (await upload.submit(value)) {
        form.reset();
        for (const name of ["video", "cover"])
          (document.getElementById(`publish-${name}`) as HTMLInputElement).value = "";
      }
    },
  });
  return (
    <section className="card mx-auto max-w-3xl bg-base-200">
      <div className="card-body gap-6">
        <h1 className="text-2xl font-bold">{t("publish.heading")}</h1>
        <p className="text-base-content/60">{t("publish.fileHelp")}</p>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit().then(() => {
              document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
            });
          }}
        >
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(busy) => (
              <fieldset disabled={busy} className="grid gap-5">
                {(["title", "description"] as const).map((name) => (
                  <form.Field key={name} name={name}>
                    {(field) => (
                      <FormField
                        id={`publish-${name}`}
                        label={name === "title" ? t("publish.title") : t("publish.description")}
                        errors={field.state.meta.errors}
                      >
                        <textarea
                          id={`publish-${name}`}
                          className="textarea w-full"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={field.state.meta.errors.length > 0}
                          aria-describedby={`publish-${name}-error`}
                        />
                      </FormField>
                    )}
                  </form.Field>
                ))}
                {(["video", "cover"] as const).map((name) => (
                  <form.Field key={name} name={name}>
                    {(field) => (
                      <FormField
                        id={`publish-${name}`}
                        label={name === "video" ? t("publish.video") : t("publish.cover")}
                        errors={field.state.meta.errors}
                      >
                        <input
                          id={`publish-${name}`}
                          className="file-input w-full"
                          type="file"
                          accept={name === "video" ? ".mp4" : ".jpg,.jpeg,.png,.webp"}
                          onBlur={field.handleBlur}
                          aria-invalid={field.state.meta.errors.length > 0}
                          aria-describedby={`publish-${name}-error`}
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            upload.changeFile(name, file);
                            field.handleChange(file);
                          }}
                        />
                        {field.state.value && (
                          <>
                            <FilePreview file={field.state.value} kind={name} />
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm justify-self-start"
                              onClick={() => {
                                field.handleChange(null);
                                upload.changeFile(name, null);
                                const input = document.getElementById(
                                  `publish-${name}`,
                                ) as HTMLInputElement;
                                input.value = "";
                              }}
                            >
                              {t(name === "video" ? "publish.clearVideo" : "publish.clearCover")}
                            </button>
                          </>
                        )}
                      </FormField>
                    )}
                  </form.Field>
                ))}
                <button className="btn btn-primary" type="submit" data-testid="form-submit">
                  {upload.stage === "failed" || upload.stage === "cancelled"
                    ? t("publish.retry")
                    : t("publish.heading")}
                </button>
              </fieldset>
            )}
          </form.Subscribe>
          <p role="status">{t(stageLabels[upload.stage])}</p>
          <label className="grid gap-1">
            {t("publish.hashProgress")}
            <progress
              className="progress progress-primary w-full"
              value={upload.hashProgress}
              max={1}
            />
          </label>
          <label className="grid gap-1">
            {t("publish.uploadedBytes", {
              uploaded: number(upload.uploadProgress),
              total: number(upload.totalBytes),
            })}
            <progress
              className="progress progress-primary w-full"
              value={upload.uploadProgress}
              max={upload.totalBytes || 1}
            />
          </label>
          {!!upload.error && (
            <p role="alert" className="text-error">
              {displayMessage(upload.error)}
            </p>
          )}
          {!!upload.error && (
            <Link to="/account" className="link">
              {t("publish.myVideos")}
            </Link>
          )}
          {upload.result && (
            <div className="alert alert-success flex-wrap">
              <span className="break-all">
                {t("publish.publishedTitle", { title: upload.result.title })}
              </span>
              <Link to="/video/$id" params={{ id: String(upload.result.id) }} className="link">
                {t("publish.viewVideo")}
              </Link>
            </div>
          )}
          {upload.busy && (
            <button type="button" className="btn" onClick={upload.cancel}>
              {t("publish.cancel")}
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
