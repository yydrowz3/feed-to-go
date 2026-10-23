export function acceptsVideoShortcut(
  event: {
    key: string;
    isComposing: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  },
  target: {
    tagName?: string;
    isContentEditable?: boolean;
    insideEditor?: boolean;
    insideButton?: boolean;
  },
  dialogOpen: boolean,
) {
  if (
    dialogOpen ||
    event.isComposing ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey
  )
    return false;
  if (
    target.isContentEditable ||
    target.insideEditor ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName ?? "")
  )
    return false;
  if (event.key === " " && (target.tagName === "BUTTON" || target.insideButton)) return false;
  return ["ArrowUp", "ArrowDown", " ", "m", "c"].includes(
    event.key.length === 1 ? event.key.toLowerCase() : event.key,
  );
}
