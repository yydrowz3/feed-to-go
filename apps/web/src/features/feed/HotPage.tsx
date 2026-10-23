import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useAuth, useRuntime } from "../../lib/app-context";
import { queryKeys } from "../../lib/query-keys";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { VideoCard } from "../video/VideoCard";
import { useFeedQuery } from "./queries";
import { uniqueVideos } from "./pagination";
export function HotPage() {
  const [limit, setLimit] = useState(10);
  const auth = useAuth();
  const { queryClient } = useRuntime();
  const query = useFeedQuery("popularity", limit);
  const form = useForm({
    defaultValues: { limit: "10" },
    validators: {
      onSubmit: z.object({
        limit: z
          .string()
          .refine(
            (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 50,
            "每页数量须为 1～50 的整数",
          ),
      }),
    },
    onSubmit: async ({ value }) => {
      const next = Number(value.limit);
      if (next === limit) await query.restart();
      else {
        queryClient.removeQueries({
          queryKey: queryKeys.feed(auth, "popularity", next),
          exact: true,
        });
        setLimit(next);
      }
    },
  });
  const items = uniqueVideos(query.data?.pages ?? []);
  const broken = query.data?.pages.at(-1)?.has_more && !query.hasNextPage;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">热榜</h1>
          <p className="mt-2 text-sm text-base-content/60">按热度排序，刷新后更新榜单。</p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="limit">
            {(field) => (
              <FormField id="hot-limit" label="每页数量" errors={field.state.meta.errors}>
                <input
                  id="hot-limit"
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  className="input w-24"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </FormField>
            )}
          </form.Field>
          <button className="btn" disabled={query.isFetching}>
            刷新 / 应用
          </button>
        </form>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError && !query.data ? (
        <ErrorState message={query.error.message} retry={() => void query.restart()} />
      ) : !items.length ? (
        <EmptyState title="暂无热榜视频" />
      ) : (
        <ol className="space-y-4">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-start gap-3">
              <span
                className={`w-7 shrink-0 pt-4 text-center text-xl font-black ${index < 3 ? "text-primary" : "text-base-content/50"}`}
              >
                {index + 1}
              </span>
              <VideoCard item={item} />
            </li>
          ))}
        </ol>
      )}
      {query.isError && !!query.data && (
        <p role="alert" className="text-error">
          {query.error.message}
        </p>
      )}
      {broken && <p role="alert">分页游标异常，请刷新榜单。</p>}
      {query.hasNextPage && (
        <button
          className="btn btn-primary"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "加载中…" : query.isError ? "重试加载更多" : "加载更多"}
        </button>
      )}
      {!query.hasNextPage && !broken && !!items.length && (
        <p className="text-center text-sm text-base-content/60">已到底</p>
      )}
    </section>
  );
}
