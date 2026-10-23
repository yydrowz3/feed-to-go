import { z } from "zod";

export function fileError(file: File | null, kind: "video" | "cover"): string | undefined {
  if (!file || !file.size) return kind === "video" ? "请选择非空视频" : "请选择非空封面";
  if (!(kind === "video" ? /\.mp4$/i : /\.(jpe?g|png|webp)$/i).test(file.name))
    return kind === "video" ? "视频仅支持 MP4" : "封面仅支持 JPG、JPEG、PNG、WebP";
  if (file.size > (kind === "video" ? 200 : 10) * 1024 * 1024)
    return kind === "video" ? "视频不能超过 200 MiB" : "封面不能超过 10 MiB";
}
const fileSchema = (kind: "video" | "cover") =>
  z.custom<File | null>().superRefine((file, ctx) => {
    const message = fileError(file, kind);
    if (message) ctx.addIssue({ code: "custom", message });
  });
export const publishSchema = z.object({
  title: z.string().trim().min(1, "请输入标题"),
  description: z.string().trim(),
  video: fileSchema("video"),
  cover: fileSchema("cover"),
});
export type PublishDraft = z.infer<typeof publishSchema>;
