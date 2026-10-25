import type en from "./en.ts";
type ResourceKey = {
  [N in keyof typeof en]: `${N}.${keyof (typeof en)[N] & string}`;
}[keyof typeof en];
type PluralBase<K> = K extends `${infer Base}_other` ? Base : never;
export type MessageKey = ResourceKey | PluralBase<ResourceKey>;
export type Message = { key: MessageKey; params?: Record<string, unknown> };
export class AppError extends Error {
  key: MessageKey;
  params?: Record<string, unknown>;
  constructor(key: MessageKey, params?: Record<string, unknown>, cause?: unknown) {
    super(key, { cause });
    this.name = "AppError";
    this.key = key;
    this.params = params;
  }
}
