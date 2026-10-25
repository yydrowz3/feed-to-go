import { useAppTranslation } from "../../i18n/react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "../../i18n/toast";
import { useAuth, useRuntime } from "../../lib/app-context";
import { parseResourceId } from "../../lib/navigation";
import { queryKeys } from "../../lib/query-keys";
import { isCancellation } from "../../api/client";
import { useAccount } from "../account/queries";
import { useActionScope } from "../account/use-action-scope";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { FormField } from "../../components/FormField";
import { messageSchema, orderMessages, sendMessage } from "./actions";

export function ConversationPage() {
  const { t } = useAppTranslation();
  const auth = useAuth();
  const { peerId } = useParams({ from: "/messages/$peerId" });
  const id = parseResourceId(peerId);
  if (id === auth.accountId) return <ErrorState message={t("errors.messageSelf")} />;
  return <Conversation key={`${auth.sessionId}:${id}`} peerId={id} />;
}
function Conversation({ peerId }: { peerId: number }) {
  const { date, t, message: displayMessage } = useAppTranslation();
  const runtime = useRuntime();
  const auth = useAuth();
  const peer = useAccount(peerId);
  const getSignal = useActionScope();
  const [error, setError] = useState<unknown>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const messages = useQuery({
    queryKey: queryKeys.messages(auth, peerId),
    queryFn: async ({ signal }) => {
      const result = await runtime.services.message.list(peerId, signal);
      return { messages: orderMessages(result.messages) };
    },
    refetchOnMount: "always",
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (messages.isSuccess && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages.isSuccess, scrollRequest]);
  const form = useForm({
    defaultValues: { content: "" },
    validators: { onSubmit: messageSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const signal = getSignal();
        const applied = await sendMessage(runtime, peerId, value.content, signal);
        if (!applied || signal.aborted || runtime.authStore.getState().sessionId !== auth.sessionId)
          return;
        form.reset();
        setScrollRequest((value) => value + 1);
      } catch (cause) {
        if (!isCancellation(cause)) {
          setError("messages.draftRetained");
          toast.error(cause);
        }
      }
    },
  });
  return (
    <section className="mx-auto flex h-[calc(100dvh-10rem)] min-h-96 w-full max-w-3xl flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/messages" className="btn btn-sm">
          {t("messages.backContacts")}
        </Link>
        <h1 className="min-w-0 break-words text-xl font-bold">
          {peer.data?.username || t("account.userId", { p0: peerId })}
        </h1>
        <Link to="/u/$id" params={{ id: String(peerId) }} className="link ml-auto">
          {t("account.profile")}
        </Link>
      </header>
      {peer.isError && (
        <ErrorState
          message={peer.error}
          fallback="errors.contactLoad"
          retry={() => void peer.refetch()}
        />
      )}
      <p className="text-xs text-base-content/60">{t("messages.historyHelp")}</p>
      <button
        type="button"
        className="btn btn-ghost btn-sm self-start"
        disabled={messages.isFetching}
        onClick={() => void messages.refetch()}
      >
        {t("messages.reload")}
      </button>
      <div
        ref={scroller}
        role="log"
        aria-label={t("messages.log")}
        className="min-h-0 flex-1 overflow-y-auto rounded-box bg-base-200 p-3"
      >
        {messages.isPending && <LoadingState />}
        {messages.isError && (
          <ErrorState
            message={messages.error}
            fallback="errors.messagesLoad"
            retry={() => void messages.refetch()}
          />
        )}
        {messages.isSuccess && !messages.data.messages.length && (
          <EmptyState title={t("messages.empty")}>{t("messages.start")}</EmptyState>
        )}
        {messages.data?.messages.map((message) => (
          <div
            key={message.id}
            className={`chat ${message.from_id === auth.accountId ? "chat-end" : "chat-start"}`}
          >
            <div className="chat-header">
              {message.from_id === auth.accountId
                ? t("messages.me")
                : peer.data?.username || t("account.userId", { p0: peerId })}
            </div>
            <div
              className={`chat-bubble max-w-[90%] whitespace-pre-wrap break-all ${message.from_id === auth.accountId ? "chat-bubble-primary" : ""}`}
            >
              {message.content}
            </div>
            <time className="chat-footer text-xs" dateTime={message.created_at}>
              {date(message.created_at)}
            </time>
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
        className="grid gap-2"
      >
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(busy) => (
            <fieldset disabled={busy || messages.isPending} className="grid gap-2">
              <form.Field name="content">
                {(field) => (
                  <FormField
                    id="message-content"
                    label={t("messages.message")}
                    errors={field.state.meta.errors}
                  >
                    <textarea
                      id="message-content"
                      className="textarea max-h-32 min-h-20 w-full"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          (event.ctrlKey || event.metaKey) &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          if (!busy) void form.handleSubmit();
                        }
                      }}
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby={
                        field.state.meta.errors.length ? "message-content-error" : undefined
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
              <p className="text-xs text-base-content/60">{t("messages.keyboardHelp")}</p>
              <button
                type="submit"
                data-testid="form-submit"
                className="btn btn-primary justify-self-end"
                disabled={busy}
              >
                {busy ? t("messages.sending") : t("messages.send")}
              </button>
            </fieldset>
          )}
        </form.Subscribe>
      </form>
    </section>
  );
}
