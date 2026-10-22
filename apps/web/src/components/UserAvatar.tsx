import { useState } from "react";
const sizes = { sm: "size-8 text-sm", md: "size-11 text-base", lg: "size-16 text-xl" };
const colors = [
  "bg-primary/20 text-primary",
  "bg-secondary/20 text-secondary",
  "bg-accent/20 text-accent",
  "bg-info/20 text-info",
];
export function UserAvatar({
  username,
  src,
  size = "md",
}: {
  username: string;
  src?: string;
  size?: keyof typeof sizes;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const name = username.trim() || "匿名用户";
  const color =
    colors[Array.from(name).reduce((sum, char) => sum + char.codePointAt(0)!, 0) % colors.length];
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold " +
        sizes[size] +
        " " +
        color
      }
    >
      {src && failedSrc !== src ? (
        <img
          className="size-full object-cover"
          src={src}
          alt={name}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span aria-label={name}>{Array.from(name)[0]}</span>
      )}
    </span>
  );
}
