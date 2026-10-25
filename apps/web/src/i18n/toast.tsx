import { toast as sonner } from "sonner";
import { TranslatedMessage } from "./ui";
import type { Message, MessageKey } from "./app-error";
export const toast = {
  success: (value: MessageKey | Message) => sonner.success(<TranslatedMessage value={value} />),
  error: (value: unknown) => sonner.error(<TranslatedMessage value={value} />),
  info: (value: MessageKey | Message) => sonner.info(<TranslatedMessage value={value} />),
};
