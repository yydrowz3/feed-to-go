import { z } from "zod";

export function fileError(file: File | null, kind: "video" | "cover"): string | undefined {
  if (!file || !file.size)
    return kind === "video" ? "validation.videoRequired" : "validation.coverRequired";
  if (!(kind === "video" ? /\.mp4$/i : /\.(jpe?g|png|webp)$/i).test(file.name))
    return kind === "video" ? "validation.videoType" : "validation.coverType";
  if (file.size > (kind === "video" ? 200 : 10) * 1024 * 1024)
    return kind === "video" ? "validation.videoSize" : "validation.coverSize";
}
const fileSchema = (kind: "video" | "cover") =>
  z.custom<File | null>().superRefine((file, ctx) => {
    const message = fileError(file, kind);
    if (message) ctx.addIssue({ code: "custom", message });
  });
export const publishSchema = z.object({
  title: z.string().trim().min(1, "validation.title"),
  description: z.string().trim(),
  video: fileSchema("video"),
  cover: fileSchema("cover"),
});
export type PublishDraft = z.infer<typeof publishSchema>;
