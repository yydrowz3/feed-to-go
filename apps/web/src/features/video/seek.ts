export function seekVideo(
  element: Pick<HTMLVideoElement, "duration" | "currentTime">,
  seconds: number,
) {
  if (!Number.isFinite(seconds) || !Number.isFinite(element.duration) || element.duration <= 0)
    return;
  element.currentTime = Math.max(0, Math.min(element.duration, seconds));
}
